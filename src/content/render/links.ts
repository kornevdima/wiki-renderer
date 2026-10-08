import type { Element, ElementContent, Root } from "hast";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import { defaultHandlers } from "remark-rehype";
import { assetContentType, assetUrl } from "@/content/links/asset-url";
import { pageHref } from "@/content/links/page-href";
import { hrefScheme, isProtocolRelative } from "@/content/links/path-guard";
import { resolveEmbed, resolveExternalLink, resolveRelativeLink } from "@/content/links/resolve";
import type { ResolvedTarget } from "@/content/links/types";
import { CLOBBER_PREFIX } from "./clobber-prefix";
import type { RenderContext } from "./pipeline";
import { unavailableImageMarker, unavailableMarker } from "./unavailable";
import type { TrustedLink } from "./wikilink";
import type { Wikilink } from "./wikilink-syntax";
import { EXTERNAL_NEW_TAB_COPY } from "./wikilink-copy";

/**
 * Relative links, external links and images (US-085, US-084; FR-024, FR-037; SR-006, SR-008, SR-010; SA-MOD Rendering
 * pipeline S6-A4, S6-A5, S6-A6; wave 7 contract W7-1..W7-4).
 *
 * **Two places, one rule set.**
 *
 * 1. `link`, `linkReference`, `image` and `imageReference` mdast handlers (`linkHandlers`). They call the default
 *    handler, then resolve the href or src with the render context of the page the node belongs to. That matters for
 *    an EMBEDDED note: its relative links are relative to ITS folder, and only here is that path known
 *    (`ctx.currentPath` is the embedded note's path inside `renderEmbed`). Reference-style links come through the same
 *    wrapper. A Markdown destination is percent-normalised by `remark-rehype` first, so the guard's one decode is the
 *    only decode of what the author wrote.
 * 2. `rehypeLinks`, a trusted step after `rehypeNoteEmbeds` and before the sanitiser, for what the handlers did not
 *    produce: raw HTML `a` and `img`. It also adds the external-link treatment to EVERY `http(s)` anchor, whoever wrote it.
 *
 * **Handled or raw.** The handlers mark their output with `dataResolvedNonce`, the per-render unguessable value of
 * `EmbedRuntime.nonce`. `rehypeLinks` removes it from every element and treats an element without the exact value as
 * author-written. An author cannot guess the value, so an author `<a href="/w/x">` is never mistaken for a resolved
 * link. A raw relative `a` or `img` inside a note embed cannot know which note it was written in, so it renders the
 * marker rather than resolving against the host page (known limit, fails closed).
 *
 * **Schemes (SR-006).** `http:` and `https:` are live; `mailto:` is live without `target`, `rel` or the icon; every other
 * scheme is blocked and its anchor becomes plain text, never an `href`. A protocol-relative `//host` is EXTERNAL and is
 * written as `https://host` (`resolveExternalLink`), never routed to internal resolution (TC-222).
 *
 * **External treatment (S6-A6, TC-454).** Set together by this one step, after `rehypeStripAuthorAttrs` removed any
 * author `target`, `rel` and class token: `target="_blank"`, `rel="noopener noreferrer"`, `class="external-link"`, then
 * after the link's own content an aria-hidden CSS-class icon and the visually hidden copy (R-7, BUG-015: no inline SVG).
 *
 * ```html
 * <a href="https://example.com" target="_blank" rel="noopener noreferrer" class="external-link">Vendor<span
 *   class="external-link-icon" aria-hidden="true"></span><span class="external-link-text">(opens in a new tab)</span></a>
 * ```
 *
 * **Images.** A relative `![alt](path)` resolves through the same guard; only an existing file of a served image type
 * (`assetContentType`) becomes `src = assetUrl(...)`. Missing, traversal, a page or any other file is the image variant
 * of the unavailable marker. An absolute `http(s)` src is left alone: the viewer's browser fetches it and the server
 * never does (SR-008). Any other scheme (`data:` included) is the image marker.
 */
export const EXTERNAL_LINK_CLASS = "external-link";
export const EXTERNAL_ICON_CLASS = "external-link-icon";
export const EXTERNAL_TEXT_CLASS = "external-link-text";
/** Every class this module emits (the schema and `rehypeStripAuthorAttrs` both derive from this one list). */
export const EXTERNAL_CLASS_TOKENS: readonly string[] = [EXTERNAL_LINK_CLASS, EXTERNAL_ICON_CLASS, EXTERNAL_TEXT_CLASS];
export const RESOLVED_NONCE_PROPERTY = "dataResolvedNonce";

type Handler = NonNullable<NonNullable<RemarkRehypeOptions["handlers"]>["yaml"]>;
type FileLike = { data: object };

interface Runtime {
  ctx: RenderContext;
  nonce: string;
}

function runtimeOf(file: FileLike | undefined): Runtime | undefined {
  const data = file?.data as { renderContext?: RenderContext; embedRuntime?: { nonce: string } } | undefined;
  if (!data?.renderContext || !data.embedRuntime) return undefined;
  return { ctx: data.renderContext, nonce: data.embedRuntime.nonce };
}

function trusted(element: Element): TrustedLink {
  return { type: "trustedLink", element };
}

function textOf(nodes: readonly ElementContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.value;
    else if (node.type === "element") out += textOf(node.children);
  }
  return out;
}

function hasScheme(href: string): boolean {
  return isProtocolRelative(href) || hrefScheme(href) !== undefined;
}

/** What a resolved relative target links to, or `undefined` when there is nothing to link to (the marker). */
function linkHrefFor(ctx: RenderContext, resolved: ResolvedTarget): string | undefined {
  if (resolved.kind === "page") {
    const base = pageHref(ctx.linkMap.wikiId, resolved.path);
    // Written cross-page, so `rehypePrefixFragmentLinks` (which only touches hrefs that start with `#`) leaves it alone.
    return resolved.heading?.matched && resolved.heading.slug ? `${base}#${CLOBBER_PREFIX}${resolved.heading.slug}` : base;
  }
  if (resolved.kind === "asset" && assetContentType(resolved.path) !== undefined) {
    return assetUrl(ctx.linkMap.wikiId, ctx.linkMap.sha, resolved.path);
  }
  return undefined;
}

/** What a relative image src becomes, or `undefined` (the image marker): only an existing served image type. */
function imageSrcFor(ctx: RenderContext, href: string): string | undefined {
  const resolved = resolveRelativeLink(ctx.linkMap, ctx.currentPath, href);
  if (resolved.kind !== "asset" || assetContentType(resolved.path) === undefined) return undefined;
  return assetUrl(ctx.linkMap.wikiId, ctx.linkMap.sha, resolved.path);
}

/** An absolute image src the browser fetches (SR-008): `http(s)` or protocol-relative, normalised like a link (`https://`, lower-case scheme). */
function externalImageSrc(src: string): string | undefined {
  const resolved = resolveExternalLink(src);
  return resolved.kind === "external" && /^https?:/.test(resolved.href) ? resolved.href : undefined;
}

function wrapAnchor(base: Handler): Handler {
  return (state, node, parent) => {
    const result = base(state, node as never, parent) as Element | ElementContent[] | undefined;
    const runtime = runtimeOf(state.options.file as unknown as FileLike);
    if (!runtime || !result || Array.isArray(result) || result.type !== "element" || result.tagName !== "a") return result as never;
    const href = result.properties?.href;
    if (typeof href !== "string") return result as never;
    result.properties[RESOLVED_NONCE_PROPERTY] = runtime.nonce;
    if (href.startsWith("#")) return result as never;
    if (hasScheme(href)) {
      const external = resolveExternalLink(href);
      if (external.kind === "blocked") return result.children as never;
      result.properties.href = external.href;
      return result as never;
    }
    const target = linkHrefFor(runtime.ctx, resolveRelativeLink(runtime.ctx.linkMap, runtime.ctx.currentPath, href));
    if (target === undefined) return trusted(unavailableMarker(textOf(result.children))) as never;
    result.properties.href = target;
    return result as never;
  };
}

function wrapImage(base: Handler): Handler {
  return (state, node, parent) => {
    const result = base(state, node as never, parent) as Element | ElementContent[] | undefined;
    const runtime = runtimeOf(state.options.file as unknown as FileLike);
    if (!runtime || !result || Array.isArray(result) || result.type !== "element" || result.tagName !== "img") return result as never;
    const src = result.properties?.src;
    if (typeof src !== "string") return result as never;
    result.properties[RESOLVED_NONCE_PROPERTY] = runtime.nonce;
    const absolute = externalImageSrc(src);
    if (absolute !== undefined) {
      result.properties.src = absolute;
      return result as never;
    }
    if (hasScheme(src)) return trusted(unavailableImageMarker()) as never;
    const target = imageSrcFor(runtime.ctx, src);
    if (target === undefined) return trusted(unavailableImageMarker()) as never;
    result.properties.src = target;
    return result as never;
  };
}

/** The four `remark-rehype` handlers, each the default one plus resolution. */
export const linkHandlers = {
  link: wrapAnchor(defaultHandlers.link as Handler),
  linkReference: wrapAnchor(defaultHandlers.linkReference as Handler),
  image: wrapImage(defaultHandlers.image as Handler),
  imageReference: wrapImage(defaultHandlers.imageReference as Handler),
} as const;

/** The `width` / `height` an image embed's pipe text may set: `300` or `300x200`, digits only (TC-451). */
const SIZE = /^(\d{1,5})(?:x(\d{1,5}))?$/;

/**
 * `![[img.png]]` (US-084, W7-4): resolved by filename through `resolveEmbed` (`embed-image`, exact case, TR-017), then
 * `assetUrl`. A target that is missing, ambiguous or not a served image type (`doc.pdf`) is the image marker, with no
 * name in the DOM. Text after the pipe is a size (`300`, `300x200`) or else the alt text; nothing the author wrote is
 * copied into an attribute except as the alt text (a hast property value, escaped by the serialiser). The `#heading`
 * part is ignored. An image takes nothing from the embed budget.
 */
export function renderImageEmbed(node: Wikilink, ctx: RenderContext, nonce: string): Element | TrustedLink {
  const resolved = resolveEmbed(ctx.linkMap, { kind: "embed-image", text: node.target });
  if (resolved.kind !== "asset" || assetContentType(resolved.path) === undefined) return trusted(unavailableImageMarker());
  const file = resolved.path.slice(resolved.path.lastIndexOf("/") + 1);
  const stem = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file;
  const size = node.display === undefined ? null : SIZE.exec(node.display);
  const properties: Element["properties"] = {
    src: assetUrl(ctx.linkMap.wikiId, ctx.linkMap.sha, resolved.path),
    alt: size === null && node.display !== undefined ? node.display : stem,
    [RESOLVED_NONCE_PROPERTY]: nonce,
  };
  if (size !== null) {
    properties.width = size[1]!;
    if (size[2] !== undefined) properties.height = size[2];
  }
  return { type: "element", tagName: "img", properties, children: [] };
}

function classesOf(el: Element): string[] {
  const value: unknown = el.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function addExternalTreatment(el: Element): void {
  const props = el.properties;
  props.target = "_blank";
  props.rel = ["noopener", "noreferrer"];
  props.className = [...classesOf(el).filter((c) => c !== EXTERNAL_LINK_CLASS), EXTERNAL_LINK_CLASS];
  el.children.push(
    { type: "element", tagName: "span", properties: { className: [EXTERNAL_ICON_CLASS], ariaHidden: "true" }, children: [] },
    { type: "element", tagName: "span", properties: { className: [EXTERNAL_TEXT_CLASS] }, children: [{ type: "text", value: EXTERNAL_NEW_TAB_COPY }] },
  );
}

/**
 * The trusted step (see the module comment). Runs after `rehypeStripAuthorAttrs` (so any author `target`, `rel`, class
 * token and nonce is already gone or mismatched) and `rehypeTrustedLinks`, and before the sanitiser.
 */
export function rehypeLinks() {
  return (tree: Root, file: FileLike): void => {
    const runtime = runtimeOf(file);

    /** `"keep"`, or the nodes that replace the anchor (its children as plain text, or the marker). */
    const anchor = (el: Element, resolved: boolean, inEmbed: boolean): "keep" | ElementContent[] => {
      const href = el.properties?.href;
      if (typeof href !== "string" || href.startsWith("#")) return "keep";
      if (hasScheme(href)) {
        const external = resolveExternalLink(href);
        if (external.kind === "blocked") return el.children;
        el.properties.href = external.href;
        if (/^https?:/i.test(external.href)) addExternalTreatment(el);
        return "keep";
      }
      if (resolved) return "keep";
      if (inEmbed || !runtime) return [unavailableMarker(textOf(el.children))];
      const target = linkHrefFor(runtime.ctx, resolveRelativeLink(runtime.ctx.linkMap, runtime.ctx.currentPath, href));
      if (target === undefined) return [unavailableMarker(textOf(el.children))];
      el.properties.href = target;
      return "keep";
    };

    const image = (el: Element, resolved: boolean, inEmbed: boolean): "keep" | Element => {
      const src = el.properties?.src;
      if (typeof src !== "string" || resolved) return "keep";
      const absolute = externalImageSrc(src);
      if (absolute !== undefined) {
        el.properties.src = absolute;
        return "keep";
      }
      if (hasScheme(src) || inEmbed || !runtime) return unavailableImageMarker();
      const target = imageSrcFor(runtime.ctx, src);
      if (target === undefined) return unavailableImageMarker();
      el.properties.src = target;
      return "keep";
    };

    const visitList = (parent: Root | Element, inEmbed: boolean): void => {
      for (let i = 0; i < parent.children.length; ) {
        const child = parent.children[i]!;
        if (child.type !== "element") {
          i++;
          continue;
        }
        const props = child.properties ?? {};
        const resolved = runtime !== undefined && props[RESOLVED_NONCE_PROPERTY] === runtime.nonce;
        if (RESOLVED_NONCE_PROPERTY in props) delete props[RESOLVED_NONCE_PROPERTY];

        if (child.tagName === "a" && !classesOf(child).includes("wikilink")) {
          const replacement = anchor(child, resolved, inEmbed);
          if (replacement !== "keep") {
            parent.children.splice(i, 1, ...replacement);
            continue;
          }
        } else if (child.tagName === "img") {
          const replacement = image(child, resolved, inEmbed);
          if (replacement !== "keep") {
            parent.children.splice(i, 1, replacement);
            i++;
            continue;
          }
        }
        visitList(child, inEmbed || classesOf(child).includes("note-embed"));
        i++;
      }
    };

    visitList(tree, false);
  };
}
