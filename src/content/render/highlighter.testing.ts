/**
 * **TEST-ONLY.** Drops the highlighter singleton so a spec can exercise the fail-closed (unprimed) path; the next
 * `primeHighlighter()` re-creates it. No shipped file may import this module (the repo-wide `*.testing` ESLint ban).
 */
export function resetHighlighterForTests(): void {
  const g = globalThis as { [k: symbol]: unknown };
  delete g[Symbol.for("wiki-renderer.content.highlighter")];
}
