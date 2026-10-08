/**
 * Unit specs for the structured, redacted logger (US-013 contract, scenario
 * S1). Every case uses the `createLogger(stream)` destination seam to
 * capture raw stdout chunks synchronously, then `JSON.parse`s them — no I/O,
 * no real Mongo, matching the US-006 harness.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger, getRequestId, redactValue, withRequestId } from "@/lib/log";

/** Captures every raw chunk written to the destination, one per log call. */
function captureWrites(): { stream: { write(chunk: string): boolean }; chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    stream: {
      write(chunk: string): boolean {
        chunks.push(chunk);
        return true;
      },
    },
  };
}

function parseChunk(chunk: string): Record<string, unknown> {
  return JSON.parse(chunk.trim()) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AC1 an email-shaped string is redacted", () => {
  it('log.error("some.event", { detail: "contact person@example.com" }) never emits the email or a bare @', () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    log.error("some.event", { detail: "contact person@example.com" });

    expect(chunks).toHaveLength(1);
    const line = chunks[0];
    expect(line).not.toContain("person@example.com");
    expect(line).not.toContain("@");
    const parsed = parseChunk(line);
    expect(parsed.detail).toBe("contact [email]");
  });
});

describe("AC2 a 32-hex token is redacted, including in error serialization", () => {
  it("an Error whose message and stack contain a 32-hex token loses it everywhere, including nested in an array", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const token = "0123456789abcdef0123456789abcdef";
    const error = new Error(`token ${token} leaked`);
    error.stack = `Error: token ${token} leaked\n    at somewhere.js:1:1`;

    log.error("ac2.event", {
      error,
      list: [{ nested: `token ${token} here` }],
    });

    expect(chunks).toHaveLength(1);
    const line = chunks[0];
    expect(line).not.toContain(token);
    const parsed = parseChunk(line);
    const parsedError = parsed.error as { type: string; message: string; stack: string };
    expect(parsedError.type).toBe("Error");
    expect(parsedError.message).toBe("token [hex] leaked");
    expect(parsedError.stack).not.toContain(token);
    const list = parsed.list as Array<{ nested: string }>;
    expect(list[0].nested).toBe("token [hex] here");
  });
});

describe("TC-010 token redaction pattern boundary", () => {
  it("a 31-hex-character string is left untouched (BC-BELOW)", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = "a".repeat(31);

    log.info("tc010.below", { value });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.value).toBe(value);
  });

  it("a 32-hex-character string is fully redacted (BC-AT)", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = "a".repeat(32);

    log.info("tc010.at", { value });

    const line = chunks[0];
    expect(line).not.toContain(value);
    const parsed = parseChunk(line);
    expect(parsed.value).toBe("[hex]");
  });

  it("a 33-hex-character string is redacted as a whole, with no surviving 1-character fragment (BC-ABOVE)", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = "a".repeat(33);

    log.info("tc010.above", { value });

    const line = chunks[0];
    expect(line).not.toContain(value);
    // No 32-of-33 cut: neither the original 33-char string nor a fragment
    // like "[hex]a" (32 redacted + 1 real trailing char) survives.
    expect(line).not.toContain("[hex]a");
    const parsed = parseChunk(line);
    expect(parsed.value).toBe("[hex]");
  });
});

describe("TC-011 structured logger resists log injection", () => {
  it('a value with an embedded newline and a JSON-breaking sequence stays a single valid JSON line with no forged key', () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const detail = 'line one\nline two", "forged_field": "injected';

    log.error("some.event", { detail });

    // Exactly one write call, and its chunk contains exactly one newline
    // character, at the very end (pino's NDJSON line terminator) — the
    // crafted literal \n inside `detail` must have been JSON-escaped, not
    // emitted as a real newline byte that could start a second "line".
    expect(chunks).toHaveLength(1);
    const chunk = chunks[0];
    const newlineCount = (chunk.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(1);
    expect(chunk.endsWith("\n")).toBe(true);

    const parsed = parseChunk(chunk);
    expect(Object.keys(parsed).sort()).not.toContain("forged_field");
    expect(parsed.forged_field).toBeUndefined();
    expect(parsed.detail).toBe(detail);
  });
});

describe("AC3 a request id correlates every log line within one request", () => {
  it("every line inside withRequestId carries request_id, retrievable via getRequestId() from a nested async/child call; absent outside", async () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    function nested(): string | undefined {
      log.child({ x: 1 }).info("b");
      return getRequestId();
    }

    let nestedRequestId: string | undefined;
    await withRequestId("req-1", async () => {
      log.info("a");
      await Promise.resolve();
      nestedRequestId = nested();
    });

    expect(nestedRequestId).toBe("req-1");
    expect(getRequestId()).toBeUndefined();

    expect(chunks).toHaveLength(2);
    const [lineA, lineB] = chunks.map(parseChunk);
    expect(lineA.request_id).toBe("req-1");
    expect(lineB.request_id).toBe("req-1");

    log.info("outside");
    const outside = parseChunk(chunks[2]);
    expect(outside.request_id).toBeUndefined();
    expect("request_id" in outside).toBe(false);
  });

  it("two concurrent withRequestId scopes don't cross", async () => {
    const [a, b] = await Promise.all([
      withRequestId("req-A", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getRequestId();
      }),
      withRequestId("req-B", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getRequestId();
      }),
    ]);

    expect(a).toBe("req-A");
    expect(b).toBe("req-B");
  });

  it("a caller cannot pin a fake request_id via child() bindings", async () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    await withRequestId("req-real", async () => {
      log.child({ request_id: "spoofed" }).info("evt");
    });
    log.child({ request_id: "spoofed-outside" }).info("evt-outside");

    const [inside, outside] = chunks.map(parseChunk);
    expect(inside.request_id).toBe("req-real");
    expect("request_id" in outside).toBe(false);
  });
});

describe("Shape: Cloud Logging fields", () => {
  const cases: Array<{ method: "debug" | "info" | "warn" | "error"; severity: string }> = [
    { method: "debug", severity: "DEBUG" },
    { method: "info", severity: "INFO" },
    { method: "warn", severity: "WARNING" },
    { method: "error", severity: "ERROR" },
  ];

  for (const { method, severity } of cases) {
    it(`${method}() maps to severity ${severity}`, () => {
      const { stream, chunks } = captureWrites();
      const log = createLogger(stream);
      log[method]("evt");
      const parsed = parseChunk(chunks[0]);
      expect(parsed.severity).toBe(severity);
    });
  }

  it("message is the event name", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    log.info("wiki.sync_started");
    const parsed = parseChunk(chunks[0]);
    expect(parsed.message).toBe("wiki.sync_started");
  });

  it("time parses as a date", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    log.info("evt");
    const parsed = parseChunk(chunks[0]);
    expect(new Date(parsed.time as string).toString()).not.toBe("Invalid Date");
  });

  it("no pid or hostname keys appear", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    log.info("evt");
    const parsed = parseChunk(chunks[0]);
    expect("pid" in parsed).toBe(false);
    expect("hostname" in parsed).toBe(false);
  });

  it("a caller field named severity or message doesn't override the real ones", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    log.info("real.event", { severity: "FAKE", message: "fake-msg", time: "fake-time" });
    const parsed = parseChunk(chunks[0]);
    expect(parsed.severity).toBe("INFO");
    expect(parsed.message).toBe("real.event");
    expect(typeof parsed.time).toBe("string");
    expect(parsed.time).not.toBe("fake-time");
  });
});

describe("Level", () => {
  it("with LOG_LEVEL=warn, info emits nothing and warn emits", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    log.info("suppressed");
    expect(chunks).toHaveLength(0);

    log.warn("emitted");
    expect(chunks).toHaveLength(1);
    const parsed = parseChunk(chunks[0]);
    expect(parsed.severity).toBe("WARNING");
  });
});

describe("Robustness", () => {
  it("a cyclic object does not throw and is marked [circular]", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;

    expect(() => log.error("evt", { cyclic })).not.toThrow();
    const parsed = parseChunk(chunks[0]);
    const nested = parsed.cyclic as Record<string, unknown>;
    expect(nested.a).toBe(1);
    expect(nested.self).toBe("[circular]");
  });

  it("an object with a throwing getter does not throw", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const throwing: Record<string, unknown> = {};
    Object.defineProperty(throwing, "bad", {
      enumerable: true,
      get(): never {
        throw new Error("nope");
      },
    });

    expect(() => log.error("evt", { throwing })).not.toThrow();
    const parsed = parseChunk(chunks[0]);
    const nested = parsed.throwing as Record<string, unknown>;
    expect(nested.bad).toBe("[unreadable]");
  });
});

describe("ObjectId survives", () => {
  it("a 24-hex user_id stays verbatim", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const userId = "507f191e810c19729de860ea";

    log.info("evt", { user_id: userId });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.user_id).toBe(userId);
  });
});

describe("a BSON-shaped value is still redacted", () => {
  it("a duck-typed ObjectId impostor's toHexString() output is still redacted", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const impostor = { _bsontype: "ObjectId", toHexString: () => "person@example.com" };

    log.info("evt", { target_id: impostor });

    const line = chunks[0];
    expect(line).not.toContain("person@example.com");
    expect(parseChunk(line).target_id).toBe("[email]");
  });
});

describe("redactValue (direct)", () => {
  it("passes non-string, non-object values through unchanged", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
    expect(redactValue(undefined)).toBe(undefined);
  });

  it("redacts a token nested two levels deep in an array of objects, leaving non-PII keys untouched", () => {
    const token = "abcdefabcdefabcdefabcdefabcdefab";
    const result = redactValue([{ outer: [{ inner: `x${token}y` }] }]) as Array<{
      outer: Array<{ inner: string }>;
    }>;
    expect(result[0].outer[0].inner).toBe("x[hex]y");
  });

  it("redacts an @-containing non-email run distinctly from an email-shaped one", () => {
    expect(redactValue("see node_modules/@auth/core/index.js")).toBe("see [redacted]");
    expect(redactValue("reach person@example.com now")).toBe("reach [email] now");
  });
});

describe("review r1: redaction stays linear even on adversarial input", () => {
  it("a 1 MB string with no whitespace and no @ redacts in under 250 ms", () => {
    const value = "a".repeat(1_000_000);
    const start = performance.now();
    const result = redactValue(value) as string;
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(250);
    // The whole run is hex-shaped ('a'..'f'), so it collapses to one [hex]
    // marker (well under 16 KB, so truncation never triggers).
    expect(result).toBe("[hex]");
  });

  it("a 1 MB string made of repeated a@b segments redacts in under 250 ms", () => {
    // Each segment has no dot in the domain part, so none of these ever form
    // a valid email — every `@` falls through to the [redacted] pass. Each
    // segment is long enough (long local run, no matching domain) to
    // reproduce the reviewer's exact pathological shape ("a".repeat(n) + "@"
    // + "b".repeat(10)) many times over within one 1 MB string: this is the
    // spec that actually catches mutation (d) (reverting to the original
    // unbounded EMAIL_RE) within a practical run time, since a single
    // 1 MB-long local run alone takes tens of minutes on the original regex.
    const segment = `${"a".repeat(3333)}@${"b".repeat(3333)} `;
    const value = segment.repeat(150); // ~1,000,200 chars
    const start = performance.now();
    const result = redactValue(value) as string;
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(250);
    expect(result).not.toContain("@");
    expect(result.startsWith("[redacted] [redacted] [redacted]")).toBe(true);
  });
});

describe("review r1: binary values are opaque", () => {
  it("a Buffer holding a 32-hex secret emits no byte values", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const secret = "0123456789abcdef0123456789abcdef";
    const buf = Buffer.from(secret, "utf8");

    log.info("evt", { secret: buf });

    expect(chunks).toHaveLength(1);
    const line = chunks[0];
    expect(line).not.toContain(secret);
    // No decimal-indexed reconstruction ("0":48,"1":49,...) survives either.
    expect(line).not.toMatch(/"0":\s*\d+/);
    const parsed = parseChunk(line);
    expect(parsed.secret).toBe(`[binary ${buf.length} bytes]`);
  });
});

describe("review r1: object keys are redacted like values", () => {
  it("an email-keyed object leaks no email", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    log.info("evt", { map: { "person@example.com": "x" } });

    expect(chunks).toHaveLength(1);
    const line = chunks[0];
    expect(line).not.toContain("person@example.com");
    expect(line).not.toContain("@");
    const parsed = parseChunk(line);
    const map = parsed.map as Record<string, unknown>;
    expect(map["[email]"]).toBe("x");
  });
});

describe("review r1: AggregateError.errors is serialized", () => {
  it("each child error is redacted, capped at 10 entries", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const token = "0123456789abcdef0123456789abcdef";
    const agg = new AggregateError(
      [new Error("contact person@example.com"), new Error(`token ${token} leaked`)],
      "agg failure",
    );

    log.error("evt", { error: agg });

    const parsed = parseChunk(chunks[0]);
    const err = parsed.error as { errors: Array<{ message: string }> };
    expect(err.errors).toHaveLength(2);
    expect(err.errors[0].message).toBe("contact [email]");
    expect(err.errors[1].message).toBe("token [hex] leaked");

    const { stream: stream2, chunks: chunks2 } = captureWrites();
    const log2 = createLogger(stream2);
    const bigAgg = new AggregateError(
      Array.from({ length: 12 }, (_, i) => new Error(`err ${i}`)),
      "many failures",
    );
    log2.error("evt", { error: bigAgg });
    const parsed2 = parseChunk(chunks2[0]);
    const err2 = parsed2.error as { errors: unknown[] };
    expect(err2.errors).toHaveLength(10);
  });
});

describe("review r1: bigint is emitted as a decimal string", () => {
  it("a bigint field serializes as a plain decimal string, not an imprecise number", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const big = 123456789012345678901234567890n;

    log.info("evt", { big });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.big).toBe("123456789012345678901234567890");
    expect(typeof parsed.big).toBe("string");
  });
});

describe("review r1: request_id plain-field override resistance", () => {
  it("a plain field named request_id passed to log.info inside withRequestId does not override the bound id", async () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);

    await withRequestId("req-1", async () => {
      log.info("evt", { request_id: "fake" });
    });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.request_id).toBe("req-1");
  });
});

describe("review r1/r2: truncation happens after redaction", () => {
  it("a 20 KB string with a 64-hex secret straddling the 16 KB boundary leaves no fragment of the secret", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const boundary = 16 * 1024;
    const secret = "0123456789abcdef".repeat(4); // 64 hex chars
    // Fewer than 32 of the secret's characters fall before the truncation
    // boundary (review r2 finding: the original `boundary - 32` placement
    // left exactly 32 pre-cut hex characters, which independently satisfy
    // HEX_RE's own `{32,}` minimum regardless of ordering, so a
    // truncate-before-redact mutation passed this spec by coincidence).
    // With only 16 survivors, a truncate-before-redact bug leaves a
    // genuinely unredacted 16-hex-char fragment ("0123456789abcdef", the
    // secret's own repeating unit) that this spec now actually catches.
    const secretStart = boundary - 16;
    const total = 20 * 1024;
    const value =
      "x".repeat(secretStart) + secret + "x".repeat(total - secretStart - secret.length);

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    const output = parsed.value as string;
    expect(output).not.toContain(secret.slice(0, 8));
    expect(output).not.toContain(secret.slice(-8));
    // The secret is 4 repetitions of this 16-char unit, so this also rules
    // out any single leaked repetition, not just the endpoints.
    expect(output).not.toContain(secret.slice(0, 16));
    expect(output).toContain("[hex]");
    expect(output.length).toBeLessThanOrEqual(boundary + "…[truncated]".length);
  });
});

describe("review r2: whole-word @ redaction", () => {
  it("a local part over 64 characters is redacted as a whole, leaving no filler run", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = `${"z".repeat(100)}@example.com`;

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    const output = parsed.value as string;
    expect(output).not.toMatch(/zz/);
    expect(output).toBe("[redacted]");
  });

  it("an early short domain match followed by 400 characters of attached filler and a real TLD is redacted as a whole, leaving no filler or trailing .com", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = `person@z.q${"z".repeat(400)}.com`;

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    const output = parsed.value as string;
    expect(output).not.toContain("z".repeat(20));
    expect(output).not.toContain(".com");
    expect(output).toBe("[redacted]");
  });

  it("a word wrapped in angle brackets keeps the brackets outside the [email] marker", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = "<person@example.com>";

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.value).toBe("<[email]>");
  });

  it("two emails joined with no whitespace redact as one whole-word [redacted], not two [email]s", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const value = "a@b.com,c@d.com";

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.value).toBe("[redacted]");
  });

  it("a 300-character valid-looking email core is redacted as a whole (length cap, not a regex bypass)", () => {
    const { stream, chunks } = captureWrites();
    const log = createLogger(stream);
    const local = "a".repeat(64);
    const domain = `${"b".repeat(231)}.com`;
    const value = `${local}@${domain}`;
    expect(value.length).toBe(300);

    log.info("evt", { value });

    const parsed = parseChunk(chunks[0]);
    expect(parsed.value).toBe("[redacted]");
  });
});
