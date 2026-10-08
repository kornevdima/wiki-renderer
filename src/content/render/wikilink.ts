import type { Element, Nodes, Root } from "hast";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import { pageHref } from "@/content/links/page-href";
import { resolveLink, resolveSamePageHeading } from "@/content/links/resolve";
import type { ResolvedTarget } from "@/content/links/types";
import { CLOBBER_PREFIX } from "./clobber-prefix";
import { renderEmbed } from "./embed";
import { UNAVAILABLE_CLASS_TOKENS, WIKILINK_UNAVAILABLE_CLASS, unavailableMarker } from "./unavailable";
import type { RenderContext } from "./pipeline";
import type { Wikilink } from "./wikilink-syntax";

/**
 * Wikilink rendering (US-075, US-078, US-076; SA-MOD Rendering pipeline Amendment 2026-09-30 S6-A1).
 *
 * **Render-context mechanism (S6-A1 `[UNVERIFIED]`, confirmed in code):** the pinned `remark-rehype` hands the `VFile` to
 * every handler as `state.options.file` (`remark-rehype/lib/index.js` calls `toHast(tree, {file, ...options})`). So the
 * `wikilink` handler reads the `RenderContext` from `file.data`, the processor stays a shared singleton, and no
 * per-call processor factory is needed. Resolution happens here, in the handler that builds hast; `page.ast` is never
 * edited (BR-036, BR-038).
 *
 * **Trust:** `rehypeStripAuthorAttrs` runs after `rehypeRaw` and removes the reserved classes from every element, which
 * would also remove the ones this handler writes. So the handler does not return the element itself: it returns a
 * `trustedLink` wrapper node that `rehypeRaw` passes through untouched (`passThrough`), and `rehypeTrustedLinks`, which
 * runs after the strip step, unwraps it. Only what this module built can carry the classes below.
 *
 * **Output:** a resolved link is `a[href].wikilink` (no `target`, no `rel`) whose text is the display text, else the
 * target as written (`Note > Heading` when a heading part is present). Until US-081, an unresolved link is a NON-link
 * `span.wikilink-unavailable` (the shared W6-1 marker) with the same text and no attribute that carries the target (W4-4). Embeds (`![[...]]`) render their own source text literally until waves 6 and 7 (W4-2). Every string
 * reaches the page only as a hast `text` node (escaped by the serialiser) or as the `pageHref` of an existing page.
 *
 * Wave 6: an unresolved link is the shared marker of `unavailable.ts` (W6-1), and a note embed is expanded by
 * `embed.ts` (W6-3); an embed of a non-Markdown target stays literal text until US-084 (W6-7).
 */
export const WIKILINK_CLASS = "wikilink";
export { WIKILINK_UNAVAILABLE_CLASS };
/** Every class this module emits (the schema and `rehypeStripAuthorAttrs` both derive from this one list). */
export const WIKILINK_CLASS_TOKENS: readonly string[] = [WIKILINK_CLASS, ...UNAVAILABLE_CLASS_TOKENS];

export interface TrustedLink {
  type: "trustedLink";
  element: Element;
}

declare module "hast" {
  interface ElementContentMap {
    trustedLink: TrustedLink;
  }
  interface RootContentMap {
    trustedLink: TrustedLink;
  }
}

/** The `type`s `rehypeRaw` must leave alone. */
export const TRUSTED_NODE_TYPES: Nodes["type"][] = ["trustedLink"];

function text(value: string): Nodes {
  return { type: "text", value };
}

function contextOf(file: { data: object } | null | undefined): RenderContext | undefined {
  return (file?.data as { renderContext?: RenderContext } | undefined)?.renderContext;
}

/**
 * The href of a resolved page link (US-077, W5-1, DEP-016). Heading ids are the parse-time slug prefixed by the
 * sanitiser (`user-content-<slug>`), so a heading fragment must carry that prefix.
 *
 * - Cross-page (`[[Note#H]]`): `pageHref(...)#user-content-<slug>`, written here. `rehypePrefixFragmentLinks` only
 *   rewrites an href that STARTS with `#`, so this one is left alone (no double prefix).
 * - Same-page (`[[#H]]`): the bare `#<slug>`, deliberately unprefixed here, because `rehypePrefixFragmentLinks` (which
 *   runs after the trusted links are unwrapped and before the sanitiser) prefixes every `#frag` href, this one included.
 *   Writing the prefix here too would give `user-content-user-content-`.
 * - No matching heading: the page's own URL with no fragment (the top of that page), for the current page too.
 */
function hrefFor(ctx: RenderContext, resolved: Extract<ResolvedTarget, { kind: "page" }>, sameFile: boolean): string {
  const slug = resolved.heading?.matched ? resolved.heading.slug : undefined;
  if (slug === undefined) return pageHref(ctx.linkMap.wikiId, resolved.path);
  return sameFile ? `#${slug}` : `${pageHref(ctx.linkMap.wikiId, resolved.path)}#${CLOBBER_PREFIX}${slug}`;
}

/**
 * The ONE wikilink resolution (US-075..US-082), shared by the body handler below and the properties panel (US-160): the
 * resolved page's href, or `undefined` when the link is unavailable (not found, ambiguous, an asset, traversal), so
 * a caller can only ever build the marker, never a target. `bareSamePage` writes `[[#H]]` as the bare `#slug` (the body,
 * whose `rehypePrefixFragmentLinks` then prefixes it); `false` writes it cross-page to the current page, already prefixed.
 */
export function resolveWikilinkHref(ctx: RenderContext, node: Wikilink, bareSamePage: boolean): string | undefined {
  const sameFile = node.target === "";
  const resolved: ResolvedTarget = sameFile
    ? resolveSamePageHeading(ctx.linkMap, ctx.currentPath, node.heading ?? "")
    : resolveLink(ctx.linkMap, {
        kind: "wikilink",
        text: node.target,
        ...(node.heading !== undefined ? { heading: node.heading } : {}),
        ...(node.display !== undefined ? { display: node.display } : {}),
      });
  return resolved.kind === "page" ? hrefFor(ctx, resolved, sameFile && bareSamePage) : undefined;
}

type Handler = NonNullable<NonNullable<RemarkRehypeOptions["handlers"]>["yaml"]>;

/** The `remark-rehype` handler for the `wikilink` mdast node. */
export const wikilinkHandler: Handler = (state, mdastNode, parent) => {
  const node = mdastNode as unknown as Wikilink;
  const ctx = contextOf(state.options.file);
  if (node.embed) {
    // A paragraph's own embeds go through `paragraphHandler`, which splits the `p` around a block. Reached here: a tight
    // list item's text (parent is its paragraph) and a table cell, where a block is valid, so the embed expands; in a
    // heading, emphasis, a link or any other phrasing container it degrades (`renderEmbed`).
    if (!ctx) return text(node.raw) as never;
    // A cell (or tight-list paragraph) holding raw HTML may have an open phrasing element around the embed, so it
    // degrades, the same rule as `paragraphHandler`.
    const hasRawHtml = parent !== undefined && "children" in parent && parent.children.some((c) => c.type === "html");
    const blockOk = (parent?.type === "paragraph" || parent?.type === "tableCell") && !hasRawHtml;
    return renderEmbed(node, ctx, state.options.file as unknown as { data: object }, blockOk).node as never;
  }
  if (!ctx) return text(node.value) as never;

  const href = resolveWikilinkHref(ctx, node, ctx.depth === 0);
  const element: Element =
    href !== undefined
      ? {
          type: "element",
          tagName: "a",
          // Inside an embedded note (`depth > 0`) `[[#H]]` is written cross-page, to the embedded note's own page (W6-5):
          // the host renames that note's heading ids, so a bare `#slug` would point at the wrong id (`embed.ts`).
          properties: { href, className: [WIKILINK_CLASS] },
          children: [text(node.value) as Element["children"][number]],
        }
      : unavailableMarker(node.value);
  return { type: "trustedLink", element } as never;
};

/**
 * Unwraps every `trustedLink`. Runs after `rehypeStripAuthorAttrs` and before the callouts step. Inside an author `<a>`
 * a nested anchor would break hydration (the browser parser closes the outer one), so there the link's visible text is
 * emitted as plain text: no `wikilink` class, no href, and no unavailable span either.
 */
export function rehypeTrustedLinks() {
  const walk = (parent: Root | Element, inAnchor: boolean): void => {
    parent.children.forEach((child, i) => {
      const node = child as Nodes;
      if ((node.type as string) === "trustedLink") {
        const { element } = node as unknown as TrustedLink;
        parent.children[i] = inAnchor ? (element.children[0] as Element["children"][number]) : element;
      } else if (node.type === "element") {
        walk(node, inAnchor || node.tagName === "a");
      }
    });
  };
  return (tree: Root): void => walk(tree, false);
}
