import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import pino from "pino";

/**
 * Structured, redacted pino logger (US-013, ADR-017, SA-MOD Audit and
 * observability §2/§3, BR-044, TR-035, SR-019).
 *
 * One JSON line per event, to stdout, shaped for Cloud Logging's
 * structured-payload parser: `severity` (`DEBUG`/`INFO`/`WARNING`/`ERROR`/
 * `CRITICAL`, mapped from pino's numeric level), `message` (the event name),
 * `time` (ISO-8601). No `pid`/`hostname` base fields. A request id, bound via
 * `withRequestId`/`getRequestId` on an `AsyncLocalStorage`, is attached to
 * every line emitted during that scope via pino's `mixin`.
 *
 * ## Redaction — the load-bearing part
 *
 * pino's own `redact` option only strips values at known *key paths*; it
 * can't find an email or a token inside free-text (a `detail` field, an
 * error message, a stack trace). So redaction here is a single pure,
 * exported function, `redactValue`, that recursively walks every value
 * reaching a log line — strings, arrays, plain objects, and serialized
 * errors — and is applied from exactly two points, never re-implemented at
 * a call site:
 *
 *   1. pino's `formatters.log` hook (covers every field passed to `log.*`,
 *      every `child()` binding via `formatters.bindings`, and error
 *      serialization);
 *   2. the event/message string itself, redacted in the `debug`/`info`/
 *      `warn`/`error` wrappers below, because pino's `formatters.log` hook
 *      only sees the fields object, never the `msg` argument that becomes
 *      the `message` key.
 *
 * What's redacted (BR-044, taken literally — the demo greps literally):
 *   - the unit of `@` redaction is the whole whitespace-delimited word
 *     (review r2 amendment, replacing both "email-shaped substring" and "any
 *     remaining `@` run" as separate rules — a windowed match left text
 *     outside the window as raw, unredacted plaintext whenever a real local
 *     part or domain ran longer than the window, a real bypass). A word with
 *     no `@` is untouched by this rule. A word with `@` is stripped of at
 *     most one leading and one trailing run of `<>()[]{},;:"'`; if the
 *     remaining core is <= 254 characters and matches
 *     `^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$`
 *     it becomes `[email]` with the stripped leading/trailing text preserved
 *     around the marker (e.g. `<person@example.com>` -> `<[email]>`);
 *     otherwise the *entire original word* becomes `[redacted]`, with no
 *     partial content preserved (accepted consequences: a stack frame path
 *     like `node_modules/@auth/core/...` is masked whole, and
 *     `a@b.com,c@d.com` — two emails joined with no whitespace — becomes one
 *     `[redacted]`, not two `[email]`s);
 *   - any run of >= 32 hex characters (case-insensitive, the *whole* run,
 *     bounded by non-hex characters or the string's edges) -> `[hex]`. A
 *     31-hex run and a 24-hex ObjectId are left untouched. Content-runtime
 *     code that needs a commit SHA in a log line must log a short SHA
 *     (<= 12 chars) — a 40-hex SHA would otherwise be masked (carry-forward).
 *   - object **keys** go through the same redaction as values (review r1
 *     amendment, overriding the original "keys aren't rewritten" ruling — a
 *     map keyed by an email leaked it verbatim). If two keys redact to the
 *     same string (e.g. two different emails both becoming `[email]`), the
 *     later one wins, same as any plain-object key collision.
 *   - `Buffer`, any `TypedArray`, `ArrayBuffer` and `DataView` are opaque:
 *     `"[binary N bytes]"`, never walked by index (walking one via
 *     `Object.keys` emitted its raw bytes as a decimal-indexed object — a
 *     real bypass of the redaction, review r1 major finding).
 *   - a BSON `ObjectId` (detected by duck typing — `_bsontype === "ObjectId"`
 *     and a `toHexString` function, so this module never imports `mongodb`/
 *     `bson`) is stringified via `toHexString()`, checked before the generic
 *     object walk below would otherwise surface its packed-integer internals
 *     (`{"i0":...,"i1":...}`) instead of the 24-hex string every consumer
 *     actually wants (US-012 review r1 amendment, 2026-09-17 — scoped fix to
 *     this already-accepted module).
 *   - a string value longer than 16 KB is truncated to 16 KB plus the marker
 *     `…[truncated]`, applied *after* redaction (truncating first could cut
 *     a hex secret into an unredacted fragment).
 *   - `AggregateError.errors` is serialized too (each entry redacted, capped
 *     at 10) and `bigint` fields are emitted as a decimal string (both were
 *     silently dropped/imprecise before — review r1 minors).
 *
 * ## Redaction is O(n), not O(n^2) — review r1 blocker, still holds under r2
 *
 * The original email pattern's unbounded greedy local-part class made
 * `String.replace` quadratic in the length of *any* long word-shaped run,
 * with or without an `@` (JS regex engines re-scan the greedy run's extent
 * from every failed start position — measured 10 s at 80 KB). `redactString`
 * below never runs an unbounded regex over the whole string:
 *   - if the string has no `@` at all, the whole-word `@` pass is skipped
 *     entirely (`indexOf("@") === -1`);
 *   - otherwise, `redactWords` is a single manual forward scan for
 *     whitespace-delimited word boundaries — O(n), never a whole-string
 *     regex with backtracking. Per `@`-containing word found this way, the
 *     leading/trailing punctuation strip is bounded by that word's own
 *     length (so the total strip cost across all words is <= n), and the
 *     email-shape regex only ever runs on a core already capped at 254
 *     characters (checked *before* the regex, via short-circuit `&&`) — a
 *     bounded regex on a bounded string is O(1) per word, regardless of `n`
 *     or of how long the original word was (review r2 amendment: this is
 *     also why a window-clipped partial match, r2's leak, can't happen —
 *     there is no window, only "whole word matches" or "whole word
 *     redacted");
 *   - `HEX_RE`'s `{32,}` has no follow-on pattern to backtrack against, so
 *     it stays linear even on adversarial input (a long run either matches
 *     immediately, or a short one fails after a bounded scan).
 *
 * ## Reserved fields
 *
 * `severity`, `message` and `time` are pino-owned output positions (via
 * `formatters.level`, `messageKey`, and the `timestamp` function) — a caller
 * field with one of those names is deleted inside `formatters.log` /
 * `formatters.bindings` before pino ever gets to serialize it, so the real
 * value is always the only one in the output, never a caller-supplied
 * impostor. `request_id` is owned by `mixin` + `mixinMergeStrategy`, which
 * makes the mixin's value win over anything of the same name in the
 * `mergingObject` passed to a call.
 *
 * A gotcha specific to this pino version: `logger.child(bindings)` with no
 * second argument silently swaps in an identity `bindings` formatter for
 * that instance (a documented pino performance optimization), bypassing our
 * custom one entirely. `child()` below always re-passes
 * `{ formatters: { bindings: bindingsFormatter } }` explicitly so child
 * (and grandchild) bindings are redacted and reserved-key-stripped too.
 *
 * ## Level
 *
 * `LOG_LEVEL` is read directly off `process.env`, never through `@/lib/env`:
 * the logger has to work even when env validation itself fails, and
 * `env.ts` must never import this module (see the comment on env.ts) — a
 * circular "does validating the env need the logger, does the logger need
 * validated env" dependency. Default: `info` in production, `debug`
 * otherwise.
 *
 * ## Destination
 *
 * No transports, no worker threads, no pretty-printer. Synchronous stdout
 * (`pino.destination({ dest: 1, sync: true })`) so lines survive
 * `process.exit` and stay ordered. `createLogger(stream)` is the seam unit
 * specs use to capture output instead of writing to real stdout; the
 * exported `log` is the real stdout instance.
 */

export type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

// ── Request-id correlation (SA-MOD §3) ───────────────────────────────────
// Module-scoped and shared across every Logger instance (the real `log` and
// any `createLogger(stream)` test instance): request correlation is a
// property of the async call stack, not of which logger object happens to
// emit within it.
const requestIdStorage = new AsyncLocalStorage<string>();

export function withRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

// ── Level (read directly off process.env — see the module comment) ──────
const KNOWN_LEVELS = new Set(["fatal", "error", "warn", "info", "debug", "trace"]);

function resolveLevel(): string {
  const configured = process.env.LOG_LEVEL;
  if (configured && KNOWN_LEVELS.has(configured)) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const LEVEL_TO_SEVERITY: Record<string, Severity> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

// Reserved output-shape keys a caller's fields/bindings can never overwrite.
// `request_id` is deliberately excluded here: by the time `formatters.log`
// runs, `mixinMergeStrategy` has already made the mixin's `request_id` the
// authoritative value in the merged object, so stripping it here would
// delete the *real* one, not a caller impostor.
const RESERVED_LOG_KEYS = ["severity", "message", "time"] as const;
// Child bindings never go through mixin/mixinMergeStrategy at all, so
// `request_id` (along with the other three) must be stripped defensively
// here instead — a caller must never be able to pin a fake request id via
// `child({ request_id: "..." })`.
const RESERVED_BINDING_KEYS = ["severity", "message", "time", "request_id"] as const;

// ── Redaction (BR-044) ────────────────────────────────────────────────────
// See the module comment's "Redaction is O(n)" section for why none of this
// runs an unbounded regex over an arbitrarily long string.
const HEX_RE = /[0-9a-fA-F]{32,}/g;
const WHITESPACE_RE = /\s/;

// The unit of `@` redaction is the whole whitespace-delimited word (review
// r2 amendment). Characters stripped from at most the leading and at most
// the trailing run of a word before checking whether the remaining core is
// email-shaped — e.g. `<person@example.com>` keeps its angle brackets
// outside the `[email]` marker; `(person@example.com)` likewise.
const WORD_TRIM_CHARS = new Set([...'<>()[]{},;:"\'']);

// The core (the word with at most one leading and one trailing punctuation
// run stripped) must be at most this many characters *before* the
// email-shape regex ever runs on it — checked first, via short-circuit
// `&&`, so the regex always executes on a bounded (O(1)) string, never on
// the word's full, unbounded length.
const MAX_EMAIL_CORE_LENGTH = 254;
// Anchored both ends: the *whole* (bounded) core must be email-shaped, not
// merely contain an email-shaped substring — this is what makes "redact the
// whole word or nothing" possible without a window to fall off the edge of.
const EMAIL_CORE_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

const MAX_STRING_LENGTH = 16 * 1024;
const TRUNCATION_MARKER = "…[truncated]";

/** Splits a `@`-containing word into an optional leading punctuation run, a
 * core, and an optional trailing punctuation run — each run is the maximal
 * contiguous prefix/suffix made only of `WORD_TRIM_CHARS`. The word always
 * contains at least one `@` (checked by the caller before this runs), and
 * `@` is never itself in `WORD_TRIM_CHARS`, so the core can never be empty. */
function splitWordCore(word: string): { leading: string; core: string; trailing: string } {
  let start = 0;
  while (start < word.length && WORD_TRIM_CHARS.has(word[start])) start++;
  let end = word.length;
  while (end > start && WORD_TRIM_CHARS.has(word[end - 1])) end--;
  return { leading: word.slice(0, start), core: word.slice(start, end), trailing: word.slice(end) };
}

/** Redacts one `@`-containing word: `[email]` (with the stripped leading and
 * trailing punctuation runs preserved around the marker) when the core is
 * email-shaped, otherwise the *entire original word* -> `[redacted]`, with
 * no partial content surviving — replacing the windowed match that left
 * text outside its window as raw, unredacted plaintext (review r2 major). */
function redactWord(word: string): string {
  const { leading, core, trailing } = splitWordCore(word);
  if (core.length <= MAX_EMAIL_CORE_LENGTH && EMAIL_CORE_RE.test(core)) {
    return `${leading}[email]${trailing}`;
  }
  return "[redacted]";
}

/**
 * Replaces every whitespace-delimited word containing `@` with either
 * `[email]` or `[redacted]` (see `redactWord`). A single manual forward scan
 * for word boundaries — O(n), no regex backtracking over the string as a
 * whole; the only regex run per word is `EMAIL_CORE_RE` against a core
 * already capped at `MAX_EMAIL_CORE_LENGTH` characters.
 */
function redactWords(value: string): string {
  let result = "";
  let cursor = 0;
  let i = 0;
  const n = value.length;

  while (i < n) {
    if (WHITESPACE_RE.test(value[i])) {
      i++;
      continue;
    }
    const wordStart = i;
    let hasAt = false;
    while (i < n && !WHITESPACE_RE.test(value[i])) {
      if (value[i] === "@") hasAt = true;
      i++;
    }
    if (hasAt) {
      result += value.slice(cursor, wordStart) + redactWord(value.slice(wordStart, i));
      cursor = i;
    }
  }

  return result + value.slice(cursor);
}

/** Applied after every other redaction pass — never before, or a truncated
 * secret could survive as an unredacted fragment right at the cut. */
function truncateAfterRedaction(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return value.slice(0, MAX_STRING_LENGTH) + TRUNCATION_MARKER;
}

function redactString(value: string): string {
  let working = value;
  if (working.indexOf("@") !== -1) {
    working = redactWords(working);
  }
  working = working.replace(HEX_RE, "[hex]");
  return truncateAfterRedaction(working);
}

/** `Buffer` / `TypedArray` / `ArrayBuffer` / `DataView` -> an opaque byte
 * count, never walked by index (walking one via `Object.keys` emits its raw
 * bytes as a decimal-indexed object — review r1 major finding). */
function describeBinary(value: object): string | undefined {
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`;
  if (ArrayBuffer.isView(value)) return `[binary ${(value as ArrayBufferView).byteLength} bytes]`;
  return undefined;
}

/** Duck-typed BSON `ObjectId` detection (US-012 review r1 amendment,
 * 2026-09-17): `_bsontype === "ObjectId"` and a `toHexString` function —
 * true for any bson-shaped object regardless of which copy of the
 * `mongodb`/`bson` package constructed it, without this module importing
 * either. Checked before the generic object walk, which otherwise emits an
 * `ObjectId`'s packed-integer internals (`{"i0":...}`) instead of its
 * 24-hex string. Never throws: a throwing `toHexString()` falls through to
 * the generic walk (and that walk's own try/catch) rather than crashing. */
function describeObjectId(value: object): string | undefined {
  const candidate = value as { _bsontype?: unknown; toHexString?: unknown };
  if (candidate._bsontype !== "ObjectId" || typeof candidate.toHexString !== "function") return undefined;
  try {
    return (candidate.toHexString as (this: unknown) => string).call(value);
  } catch {
    return undefined;
  }
}

interface ErrorLike extends Error {
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
}

/**
 * The single pure, exported redaction function (dispatcher ruling: "a pure
 * function ... applied from one place"). Walks strings, arrays, plain
 * objects and `Error` instances (serialized to `{ type, message, stack,
 * code?, cause? }` first, then redacted like everything else). Never
 * throws: a throwing getter or a cyclic object degrades to a placeholder
 * string rather than crashing the caller — logging must never break the
 * caller.
 */
export function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  // A bigint isn't JSON-serializable as a number without losing precision
  // past MAX_SAFE_INTEGER (and pino's own fast serialization otherwise
  // emits it as a bare, unquoted digit sequence) — emit it as a decimal
  // string explicitly instead (review r1 minor).
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactString(value);
  if (value === null || value === undefined || typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";

  const binary = describeBinary(value);
  if (binary !== undefined) return binary;

  const objectId = describeObjectId(value);
  // Still redacted: a genuine ObjectId's 24-hex passes through unchanged, but a
  // duck-typed impostor's toHexString() can return anything (review r2 minor).
  if (objectId !== undefined) return redactString(objectId);

  if (value instanceof Error) {
    const err = value as ErrorLike;
    seen.add(value);
    try {
      const out: Record<string, unknown> = {
        type: err.name,
        message: redactString(err.message),
        stack: err.stack === undefined ? undefined : redactString(err.stack),
      };
      if (err.code !== undefined) out.code = redactValue(err.code, seen);
      if (err.cause !== undefined) out.cause = redactValue(err.cause, seen);
      // AggregateError.errors (and any similarly-shaped custom error) was
      // silently dropped before — walk it through the same redaction, each
      // entry, capped at 10 so one huge aggregate can't blow up a log line
      // (review r1 minor).
      if (Array.isArray(err.errors)) {
        out.errors = err.errors.slice(0, 10).map((entry) => redactValue(entry, seen));
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        try {
          return redactValue(item, seen);
        } catch {
          return "[unreadable]";
        }
      });
    }

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      // Keys go through the same string redaction as values (review r1
      // amendment — a map keyed by an email leaked it verbatim as a JSON
      // key). A collision between two keys redacting to the same string
      // keeps the later value, same as any plain-object key collision.
      const safeKey = redactString(key);
      let raw: unknown;
      try {
        raw = (value as Record<string, unknown>)[key];
      } catch {
        out[safeKey] = "[unreadable]";
        continue;
      }
      try {
        out[safeKey] = redactValue(raw, seen);
      } catch {
        out[safeKey] = "[unreadable]";
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function stripReservedKeys(
  object: Record<string, unknown>,
  reserved: readonly string[],
): Record<string, unknown> {
  const safe = { ...object };
  for (const key of reserved) delete safe[key];
  return safe;
}

/** `formatters.bindings` — applied at logger construction (the `base`) and,
 * explicitly, at every `child()` call (see the module comment's gotcha). */
function bindingsFormatter(bindings: Record<string, unknown>): Record<string, unknown> {
  return redactValue(stripReservedKeys(bindings, RESERVED_BINDING_KEYS)) as Record<string, unknown>;
}

/** `formatters.log` — the per-call hook covering every field passed to
 * `log.*`, including nested arrays/objects and serialized errors. */
function logFormatter(object: Record<string, unknown>): Record<string, unknown> {
  return redactValue(stripReservedKeys(object, RESERVED_LOG_KEYS)) as Record<string, unknown>;
}

function buildPinoOptions(): pino.LoggerOptions {
  return {
    level: resolveLevel(),
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    formatters: {
      level(label) {
        return { severity: LEVEL_TO_SEVERITY[label] ?? "INFO" };
      },
      bindings: bindingsFormatter,
      log: logFormatter,
    },
    mixin() {
      const requestId = getRequestId();
      return requestId === undefined ? {} : { request_id: requestId };
    },
    mixinMergeStrategy(mergeObject, mixinObject) {
      return { ...mergeObject, ...mixinObject };
    },
  };
}

type Level = "debug" | "info" | "warn" | "error";

function makeLevelFn(instance: pino.Logger, level: Level): Logger[Level] {
  return (event: string, fields?: Record<string, unknown>): void => {
    try {
      const safeEvent = redactValue(event) as string;
      instance[level](fields ?? {}, safeEvent);
    } catch {
      // The logger must never throw into the caller's control flow.
    }
  };
}

function wrap(instance: pino.Logger): Logger {
  return {
    debug: makeLevelFn(instance, "debug"),
    info: makeLevelFn(instance, "info"),
    warn: makeLevelFn(instance, "warn"),
    error: makeLevelFn(instance, "error"),
    child(bindings: Record<string, unknown>): Logger {
      try {
        return wrap(instance.child(bindings, { formatters: { bindings: bindingsFormatter } }));
      } catch {
        // A throwing binding (e.g. a cyclic value) must not crash the
        // caller either — fall back to an unbound child of the same
        // instance rather than losing every subsequent log call.
        return wrap(instance);
      }
    },
  };
}

/**
 * Builds a fresh `Logger` writing to `stream` (default: synchronous real
 * stdout, fd 1). The destination seam unit specs use to capture output
 * instead of writing to the process's real stdout.
 */
export function createLogger(stream: pino.DestinationStream = pino.destination({ dest: 1, sync: true })): Logger {
  return wrap(pino(buildPinoOptions(), stream));
}

export const log: Logger = createLogger();
