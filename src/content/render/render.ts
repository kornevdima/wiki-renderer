import type { Root as HastRoot } from "hast";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { snapshotCacheStore } from "@/content/runtime/cache";
import type { WikiSnapshot } from "@/content/runtime/types";
import { bodyStartsWithH1 } from "./body-starts-with-h1";
import { buildFrontmatterView } from "./frontmatter-view";
import { collectOutline } from "./heading-outline";
import { collectMermaidBlocks } from "./mermaid-placeholder";
import { createRenderContext, mdastToHast } from "./pipeline";
import { freezeRendered, insertRendered, renderCacheKey, renderCacheStore } from "./render-cache";
import { resolveWikilinkHref } from "./wikilink";
import type { ParsedPage, RenderedPage } from "./types";

/**
 * Renders one page from the snapshot's already-parsed AST; it never parses text again (BR-036).
 *
 * Cached per `(wikiId, sha, path)` and insert-only (US-087, `render-cache.ts`). The result is viewer-free, so the signature takes no session. `unavailable` is never cached.
 * Synchronous, so two "concurrent" callers are two sequential calls and the second is a hit; no locking is needed
 * (TC-225).
 */
export function renderPage(snapshot: WikiSnapshot, path: string): RenderedPage | { state: "unavailable" } {
  const page = snapshot.pages.get(path);
  if (!page) return { state: "unavailable" };
  const cache = renderCacheStore();
  const key = renderCacheKey(snapshot, path);
  const hit = cache.get(key);
  if (hit) return hit;
  const rendered = freezeRendered(renderUncached(snapshot, page));
  // The orphan guard: only the snapshot that is still THE cached one for its wiki owns render entries. One swapped out
  // since the caller's `getSnapshot` renders uncached, so no entry outlives its snapshot.
  if (snapshotCacheStore().get(snapshot.wikiId)?.snapshot !== snapshot) return rendered;
  // The estimate is the page's source size (D1): React elements have no cheap size.
  const sourceBytes = snapshot.files.get(path)?.bytes.byteLength ?? page.rawText.length;
  insertRendered(snapshot.wikiId, key, rendered, sourceBytes);
  return rendered;
}

/**
 * Converts the body once. When the page opens with its own h1 (US-220, E3-D7) the first hast element is split off as
 * `leadHeading` and the rest is `body`, each converted once, and `content` is the two together (the same markup as a single
 * conversion), so the meta line can follow that heading. Otherwise `content` is `body` and there is no lead heading.
 */
function convertBody(hast: HastRoot, ast: ParsedPage["ast"]): { content: ReactNode; leadHeading: ReactNode | null; body: ReactNode } {
  const index = bodyStartsWithH1(ast) ? hast.children.findIndex((node) => node.type !== "text" || node.value.trim() !== "") : -1;
  const first = index === -1 ? undefined : hast.children[index];
  if (first === undefined || first.type !== "element" || first.tagName !== "h1") {
    const content = toJsxRuntime(hast, { Fragment, jsx, jsxs });
    return { content, leadHeading: null, body: content };
  }
  const leadHeading = toJsxRuntime({ type: "root", children: hast.children.slice(0, index + 1) }, { Fragment, jsx, jsxs });
  const body = toJsxRuntime({ type: "root", children: hast.children.slice(index + 1) }, { Fragment, jsx, jsxs });
  return { content: jsxs(Fragment, { children: [leadHeading, body] }), leadHeading, body };
}

function renderUncached(snapshot: WikiSnapshot, page: ParsedPage): RenderedPage {
  const ctx = createRenderContext(page.path, snapshot.linkMap, (path) => snapshot.pages.get(path)?.ast);
  const hast = mdastToHast(page.ast, ctx);
  const { content, leadHeading, body } = convertBody(hast, page.ast);
  return {
    path: page.path,
    title: page.title,
    frontmatterView: buildFrontmatterView(page.frontmatter, (node) => resolveWikilinkHref(ctx, node, false)),
    content,
    leadHeading,
    body,
    headings: page.headings,
    outline: collectOutline(hast),
    mermaidBlocks: collectMermaidBlocks(hast),
  };
}
