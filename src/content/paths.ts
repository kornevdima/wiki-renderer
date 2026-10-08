/**
 * The one "is this a Markdown page" test, dependency-free so the budget can use it without importing the render
 * pipeline. `parsePages` and the budget's text/asset split (US-139 D3b) both call it.
 */
export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}
