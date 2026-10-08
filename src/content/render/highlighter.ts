import { createCssVariablesTheme, createHighlighter, type Highlighter } from "shiki";
import { log } from "@/lib/log";

/**
 * The Shiki highlighter singleton (US-072, ADR-010, SA-MOD Rendering pipeline S6-A2). Shiki creates its highlighter
 * asynchronously while `renderPage` is synchronous, so `content/runtime/build.ts` (already async) primes it before the
 * first page of a snapshot can render. The pipeline then reads it synchronously through `getHighlighter()`.
 *
 * Fail closed: not primed (a spec that skips `build()`, a failed prime) means `getHighlighter()` is `undefined` and
 * code renders as plain `pre > code`. Nothing here throws to a caller and nothing is awaited on the render path. A
 * failed prime is logged once with no page content and retried by the next `primeHighlighter()` call.
 *
 * The slot lives on `globalThis` under a `Symbol.for` key: the instrumentation and page bundles were measured to hold
 * separate copies of a module-scoped `let` (BUG-014).
 */
/**
 * The one theme (ADR-010 amendment 2026-10-05, US-190): Shiki's css-variables theme, so a token span reads
 * `color:var(--shiki-token-*)` (or `--shiki-foreground` for an unscoped token) and `wr-prose.css` defines those variables
 * from the ESG tokens under the reader's theme. `fontStyle: false` keeps every span colour-only (no italic, bold or
 * underline in the style), which is what lets the sanitiser admit a span style as one fixed colour form (ADR-008).
 */
export const HIGHLIGHT_THEME = createCssVariablesTheme({ fontStyle: false });
export const HIGHLIGHT_LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "bash",
  "yaml",
  "markdown",
  "python",
  "sql",
  "diff",
] as const;

/** The info-string tags that resolve to a preloaded language (Shiki aliases included), lowercase. */
export const HIGHLIGHT_LANGUAGE_TAGS: ReadonlySet<string> = new Set([
  ...HIGHLIGHT_LANGUAGES,
  "ts",
  "js",
  "sh",
  "shell",
  "zsh",
  "yml",
  "md",
  "py",
]);

/** A block over this many characters renders plain, so one page cannot stall the synchronous render (TC-442). */
export const MAX_HIGHLIGHT_CHARS = 50_000;

/**
 * The cumulative budget for one render (W2-15): once the highlighted characters of a page reach it, the remaining
 * blocks render plain, so a page of many just-under-ceiling blocks cannot stall the synchronous render. It is created
 * per `mdastToHast` call and travels on the `VFile`'s `data`, never in module state.
 */
export const HIGHLIGHT_BUDGET_CHARS = 100_000;

interface Slot {
  highlighter?: Highlighter;
  priming?: Promise<void>;
}
const SLOT = Symbol.for("wiki-renderer.content.highlighter");

function slot(): Slot {
  const g = globalThis as { [SLOT]?: Slot };
  return (g[SLOT] ??= {});
}

/** The primed highlighter, or `undefined` (render plain). Synchronous. */
export function getHighlighter(): Highlighter | undefined {
  return slot().highlighter;
}

/** Idempotent. Resolves once primed, or after a logged failure (never rejects). */
export function primeHighlighter(): Promise<void> {
  const s = slot();
  if (s.highlighter) return Promise.resolve();
  s.priming ??= createHighlighter({
    themes: [HIGHLIGHT_THEME],
    langs: [...HIGHLIGHT_LANGUAGES],
  })
    .then((hl) => {
      s.highlighter = hl;
    })
    .catch(() => {
      // No error object: nothing from a failed load is worth logging beyond the fact.
      log.child({}).error("content.highlighter_prime_failed");
    })
    .finally(() => {
      s.priming = undefined;
    });
  return s.priming;
}
