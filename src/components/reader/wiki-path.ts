import { pageHref } from "@/content/links/page-href";
import type { NavNode } from "@/content/runtime/types";

/**
 * Pure request-path logic for `/w/{wikiId}/{...path}` (SA-MOD Reader UI and print, Amendment 2026-09-29 A1;
 * US-099 + US-100 + US-158 contract X4/X5). No React, no Next, no I/O: the page (`app/w/[wikiId]/[[...path]]/
 * page.tsx`) is wiring only and calls these.
 *
 * Decoding: `params.path` segments are handed over percent-ENCODED by Next (measured, see the page's doc
 * comment and `wiki-path.test.ts`), so `resolveRequestedPath` decodes them EXACTLY ONCE. A second decode would
 * turn `%252e%252e` into `..` (TC-429).
 */

/** Longest accepted joined page path, in UTF-8 bytes (A1). */
export const MAX_PATH_BYTES = 1024;

export type RequestedPath = { kind: "landing" } | { kind: "page"; path: string } | { kind: "invalid" };

/** Percent-decodes one segment once; `null` when the escape sequence is malformed. */
function decodeOnce(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function isSafeSegment(segment: string): boolean {
  if (segment === "" || segment === "." || segment === "..") return false;
  for (const char of segment) {
    // `/`, `\`, NUL and every other C0 control character (U+0000..U+001F).
    if (char === "/" || char === "\\" || char.charCodeAt(0) <= 0x1f) return false;
  }
  return true;
}

/**
 * Turns the route's raw `params.path` into what the page should look up. Undefined or empty means the bare
 * wiki URL (landing). Anything unsafe is `invalid`, treated exactly like an absent page. Never throws.
 */
export function resolveRequestedPath(rawSegments: readonly string[] | undefined): RequestedPath {
  if (rawSegments === undefined || rawSegments.length === 0) return { kind: "landing" };
  const decoded: string[] = [];
  for (const raw of rawSegments) {
    const segment = decodeOnce(raw);
    if (segment === null || !isSafeSegment(segment)) return { kind: "invalid" };
    decoded.push(segment);
  }
  const path = decoded.join("/");
  if (Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES) return { kind: "invalid" };
  return { kind: "page", path };
}

/** Every page path in `tree`, depth-first, in the order `buildTree` emitted them. */
export function treePagePaths(tree: readonly NavNode[]): string[] {
  const out: string[] = [];
  const visit = (nodes: readonly NavNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "page") out.push(node.path);
      else visit(node.children);
    }
  };
  visit(tree);
  return out;
}

const ROOT_LANDING_NAMES = ["index.md", "README.md", "_index.md"] as const;

/**
 * The landing page for the bare wiki URL (A1, R-2, TC-436), or `null` for an empty wiki. Per name in
 * `index.md`, `README.md`, `_index.md` order: an exact-case root file first, then a case-insensitive root file
 * (ties go to the first in tree order). A subfolder's index is never a root landing. Otherwise the first page
 * depth-first in the tree.
 */
export function pickLanding(pagePaths: ReadonlySet<string>, tree: readonly NavNode[]): string | null {
  const treeOrder = treePagePaths(tree);
  const rank = new Map(treeOrder.map((path, i) => [path, i]));
  const rootFiles = [...pagePaths].filter((path) => !path.includes("/"));
  const byTreeOrder = (a: string, b: string) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity);

  for (const name of ROOT_LANDING_NAMES) {
    if (pagePaths.has(name)) return name;
    const folded = rootFiles.filter((path) => path.toLowerCase() === name.toLowerCase()).sort(byTreeOrder);
    if (folded.length > 0) return folded[0]!;
  }
  for (const path of treeOrder) {
    if (pagePaths.has(path)) return path;
  }
  return null;
}

export { pageHref };

/**
 * The URL the viewer asked for, rebuilt from the decoded request: the bare `/w/{id}` for the landing request,
 * else the canonical encoded page URL. It is the retry screen's "Try again" target (US-102, Y8-4).
 */
export function requestedHref(wikiId: string, requested: Exclude<RequestedPath, { kind: "invalid" }>): string {
  return requested.kind === "landing" ? `/w/${encodeURIComponent(wikiId)}` : pageHref(wikiId, requested.path);
}

export { bodyStartsWithH1 } from "@/content/render/body-starts-with-h1";
