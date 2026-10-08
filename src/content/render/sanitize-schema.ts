import { defaultSchema, type Options } from "rehype-sanitize";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { CLOBBER_PREFIX } from "./clobber-prefix";
import { EMBED_CLASS, EMBED_MARKER_CLASS } from "./embed";
import { EXTERNAL_ICON_CLASS, EXTERNAL_LINK_CLASS, EXTERNAL_TEXT_CLASS } from "./links";
import { UNAVAILABLE_INDICATOR_CLASS, UNAVAILABLE_TEXT_CLASS, WIKILINK_UNAVAILABLE_CLASS } from "./unavailable";
import { HEADING_ANCHOR_CLASS } from "./heading-outline";
import { WIKILINK_CLASS } from "./wikilink";
import { CALLOUT_CONTAINER_CLASSES, CALLOUT_ICON_CLASS, CALLOUT_ROLES, CALLOUT_TITLE_CLASS } from "./callouts";

/**
 * The allowlist sanitiser schema (SA-MOD Rendering pipeline §2, §9; ADR-008; SR-005, SR-006, TR-012, TR-014).
 * The schema is code, reviewed on every PR. There is no environment switch and no "unsafe" mode (contract X3).
 *
 * Built from `rehype-sanitize`'s GitHub-style `defaultSchema`, deep-copied first so the library's export is never
 * mutated. Every difference from the default is listed here:
 *
 * - attributes added: `dataMermaidId`, `dataMermaidSource` on `div` only (the Mermaid placeholder, US-086);
 *   `dataMermaidCaption` (the value `""` only) on `p` only (the undrawn caption, US-104);
 *   the Shiki output (US-072, US-190, ADR-008 amendment 2026-10-05): on `pre`, `className` exactly `shiki` / `css-variables`
 *   and `tabIndex` (`0` only), and NO `style`; on `span`, `className` exactly `line`, and `style` only as a value matching
 *   `SHIKI_SPAN_STYLE` (one colour declaration reading a `--shiki-` variable). Nothing else gains `style`, and
 *   `rehypeStripAuthorAttrs` removes every author `style`, `tabIndex` and those class tokens before any trusted step runs,
 *   so only what Shiki wrote survives.
 * - attributes added (US-073 callouts): on `div`, `role` exactly `alert` / `note` and `className` exactly the nine callout
 *   container names plus `callout-title`; on `span`, `className` `callout-icon` and `ariaHidden` exactly `true`.
 * - attributes added (US-075 wikilinks): on `a`, `className` exactly `data-footnote-backref` (the default) or `wikilink`; on `span`, `className` also exactly
 *   `wikilink-unavailable`. `rehypeStripAuthorAttrs` removes both tokens from author HTML first.
 * - attributes added (US-081, US-083, wave 6): on `span`, `className` also exactly `wikilink-unavailable-indicator` and
 *   `wikilink-unavailable-text`; on `div`, `className` also exactly `note-embed` and `embed-marker`. All four are in the
 *   reserved list of `rehypeStripAuthorAttrs`. `title` (the unavailable tooltip) needs no entry if the default allows it.
 * - attributes added (US-085, wave 7): on `a`, `className` also exactly `external-link`, `target` exactly `_blank` and `rel`
 *   exactly the tokens `noopener` and `noreferrer`; on `span`, `className` also exactly `external-link-icon` and
 *   `external-link-text`. `target`, `rel` and the three classes are in the reserved list of `rehypeStripAuthorAttrs`, so
 *   only `links.ts` (which sets `target` and `rel` together, on `http(s)` anchors) can produce them.
 * - attributes added (US-219, ADR-008 amendment 2026-10-07): on `a`, `className` also exactly `heading-anchor`, the copy anchor
 *   `rehypeHeadingAnchors` appends to an h2 / h3. It is in the reserved list of `rehypeStripAuthorAttrs`, so only that step can
 *   produce it. `ariaLabel` (its name) and `href` (a `#fragment`) are admitted by the library defaults; no other change.
 * - attributes added (US-189, TC-503): `tabIndex` (`0` only) on `table`, so a wide table that scrolls inside itself can be
 *   reached and scrolled with a keyboard. `rehypeFocusableTables` is the only writer; `rehypeStripAuthorAttrs` still removes
 *   every author-written `tabIndex` first. The library default's wildcard `tabIndex` (every element, any value) is removed in
 *   the same change, so `tabIndex` is admitted on `pre` (Shiki) and `table` only, as `0`.
 * - tags added (US-189 fix round 1): `abbr`, with the attribute `title` only (its own entry; the default `*` globals apply as for every tag).
 * - tabIndex (fix round 1): `rehypeFocusableTables` also sets `tabIndex` 0 on every `pre`, so the Shiki-only `pre` entry now serves plain fences too (no schema change).
 * - task checkboxes (fix round 1): `rehypeTaskLabels` sets `ariaLabelledBy` on the checkbox and an `id` on a wrapping `span`; `ariaLabelledBy` is added on `input` (the default admits only `disabled` and `type=checkbox` there); `id` on `span` is already allowed. Both are clobber-prefixed.
 * - align (BUG-035): the default's wildcard `align` (any string, every element) is removed. `hast-util-to-jsx-runtime` turns a
 *   table cell's `align` into `style="text-align:<value>"`, so a free string became arbitrary inline CSS. `align` is now admitted
 *   on every element (`*`) as exactly `left`, `right`, `center` or `justify` (what GFM column alignment writes). That keeps the
 *   common README idiom (`<p align="center">`, `<div align="center">`, `<img align=...>`): on a non-cell element an exact keyword
 *   stays an inert attribute (no `style`). Any other value, on any element, is dropped.
 * - tags (otherwise) added: none (`details`, `summary`, `br`, `sup`, `sub`, `kbd` are already in the default).
 * - tags removed: `picture`, `source` (their `srcSet` carries URLs the protocol allowlist cannot check).
 * - attributes removed: `headers` (a table-cell reference to ids that would be unprefixed); `srcSet` (on `source`); `action`, `method`, `accept`, `acceptCharset`, `encType` (form-only
 *   attributes; `action` carries a URL and is not protocol-checked, and `form` is not an allowed tag anyway).
 * - strip list (element AND its content removed) extended from `script` to `style`, `iframe`, `object`, `embed`,
 *   `noscript`, `template`, `svg`, `math` (otherwise their text children would survive as page text).
 * - protocols: `href` narrowed to `http`, `https`, `mailto` (default also allows `irc`, `ircs`, `xmpp`); `src`
 *   stays `http`, `https`. Relative URLs and `#fragment` carry no scheme and pass. `data:`, `javascript:`,
 *   `vbscript:` are rejected for both, whatever the obfuscation, because the sanitiser inspects the parsed
 *   attribute value, after entity decoding.
 * - accepted: an author `<input type="checkbox" checked disabled>` renders as an inert fake checkbox (no script).
 * - accepted: protocol-relative `//host` hrefs and srcs survive; they resolve to http(s) and are fetched by the
 *   viewer's browser (SR-008).
 * - unchanged on purpose: no `on*` attribute is allowlisted, and no `style` outside the Shiki span entry above; `className` only where the default
 *   allows it (`language-*` on `code`, task-list and footnote classes); `id`, `name`, `ariaDescribedBy` and
 *   `ariaLabelledBy` are clobber-prefixed.
 */
export { CLOBBER_PREFIX };

const schema: Options = structuredClone(defaultSchema);

/**
 * The one inline style the sanitiser admits (ADR-008 amendment 2026-10-05, US-190): on a Shiki token `span`, a single
 * `color` declaration whose value is `var()` of `--shiki-foreground` or a `--shiki-token-*` name. Anchored, no `g` flag,
 * no `;`, so a second property, a `url()`, a custom-property definition or any other colour fails. `hast-util-sanitize`
 * tests a RegExp allowed-value against the string value, so a style that does not match is dropped (fails closed): a Shiki
 * upgrade that changes the emitted string renders uncoloured code and never widens this. It bounds the CSP's
 * `style-src-attr 'unsafe-inline'` (ADR-016 R-1).
 */
export const SHIKI_SPAN_STYLE = /^color:var\(--shiki-(?:foreground|token-[a-z-]+)\)$/;

export const MERMAID_PLACEHOLDER_ATTRIBUTES = ["dataMermaidId", "dataMermaidSource"];

const REMOVED_TAGS = new Set(["picture", "source"]);
const REMOVED_ATTRIBUTES = new Set(["srcSet", "headers", "action", "method", "accept", "acceptCharset", "encType"]);

schema.tagNames = (schema.tagNames ?? []).filter((tag) => !REMOVED_TAGS.has(tag));
const attributes = schema.attributes ?? {};
for (const tag of Object.keys(attributes)) {
  if (REMOVED_TAGS.has(tag)) {
    delete attributes[tag];
    continue;
  }
  attributes[tag] = (attributes[tag] ?? []).filter((entry) => {
    const name = Array.isArray(entry) ? entry[0] : entry;
    return !REMOVED_ATTRIBUTES.has(name);
  });
}
// The only S06 wave-1 allowance: the Mermaid placeholder's two data attributes, an exact list on `div` only (never a
// wildcard). Author-written ones are removed by `rehypeStripAuthorAttrs` before this schema runs.
// The callouts (US-073), exact lists: on `div`, `role` ∈ {alert, note} and `className` exactly the callout container and
// title class names; on `span`, `className` exactly the icon class and `ariaHidden` "true". `div` also carries the Mermaid
// placeholder, so the schema cannot say "the callout container only"; `rehypeStripAuthorAttrs` (which removes every author
// `role`, `ariaHidden` and these class tokens before the trusted steps) is what makes that true.
attributes.div = [
  ...(attributes.div ?? []),
  ...MERMAID_PLACEHOLDER_ATTRIBUTES,
  ["role", ...CALLOUT_ROLES],
  ["className", ...CALLOUT_CONTAINER_CLASSES, CALLOUT_TITLE_CLASS, EMBED_CLASS, EMBED_MARKER_CLASS],
];
// `a` already carries `["className", "data-footnote-backref"]` and the first `className` entry wins, so the two values are
// merged into ONE exact entry rather than appended.
attributes.a = [
  ...(attributes.a ?? []).filter((entry) => !(Array.isArray(entry) && entry[0] === "className")),
  ["className", "data-footnote-backref", WIKILINK_CLASS, EXTERNAL_LINK_CLASS, HEADING_ANCHOR_CLASS],
  // Wave 7 (S6-A6): the exact values `links.ts` writes, together, on external links. An author's own are removed first.
  ["target", "_blank"],
  ["rel", "noopener", "noreferrer"],
];
attributes.p = [...(attributes.p ?? []), ["dataMermaidCaption", ""]];
// US-189: the library default allows `tabIndex` (any value) on EVERY element through its `*` entry. That wildcard is dropped,
// so `tabIndex` survives only through the two exact entries below (`pre` for Shiki, `table` for the focusable table), each `0`.
// BUG-035: the same wildcard carries `align` (any string); it is dropped too and re-added below as exact values on `*`.
attributes["*"] = (attributes["*"] ?? []).filter((entry) => {
  const name = Array.isArray(entry) ? entry[0] : entry;
  return name !== "tabIndex" && name !== "align";
});
attributes["*"].push(["align", "left", "right", "center", "justify"]);
// The Shiki output (US-072), exact lists on `pre` and `span` only. `defaultSchema` allows `className` on `code` and
// `span`-less elements only through explicit entries, so each is added here with its exact values.
attributes.pre = [
  ...(attributes.pre ?? []),
  ["className", "shiki", "css-variables"],
  ["tabIndex", 0],
];
// US-189: the focusable table (`rehypeFocusableTables`), `0` only, on `table` only.
attributes.table = [...(attributes.table ?? []), ["tabIndex", 0]];
// US-189 fix round 1: `abbr` with `title` (text) only. The `*` wildcard still carries the default global attributes.
attributes.abbr = ["title"];
// US-189 fix round 1: `rehypeTaskLabels` names a task checkbox with `ariaLabelledBy` (clobber-prefixed, like the span's `id`).
attributes.input = [...(attributes.input ?? []), "ariaLabelledBy"];
attributes.span = [
  ...(attributes.span ?? []),
  ["className", "line", CALLOUT_ICON_CLASS, WIKILINK_UNAVAILABLE_CLASS, UNAVAILABLE_INDICATOR_CLASS, UNAVAILABLE_TEXT_CLASS, EXTERNAL_ICON_CLASS, EXTERNAL_TEXT_CLASS],
  ["style", SHIKI_SPAN_STYLE],
  ["ariaHidden", "true"],
];
schema.tagNames = [...(schema.tagNames ?? []), "abbr"];
schema.attributes = attributes;

schema.strip = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"];
schema.protocols = {
  ...schema.protocols,
  href: ["http", "https", "mailto"],
  src: ["http", "https"],
};
schema.clobber = ["ariaDescribedBy", "ariaLabelledBy", "id", "name"];
schema.clobberPrefix = CLOBBER_PREFIX;

export const sanitizeSchema: Options = schema;

/**
 * Runs BEFORE the sanitiser (which stays the last hast transform). The sanitiser prefixes every `id` with
 * `CLOBBER_PREFIX` but cannot touch an `href`, so a same-page `#fragment` link (a GFM footnote reference or
 * backref, an author's `[x](#setup)`) would point at an id that no longer exists. This rewrites `#frag` to
 * `#user-content-frag`, giving "same slug, same prefix everywhere" (TR-019). `remark-rehype` therefore runs with an
 * empty `clobberPrefix` (it must not prefix the ids itself: the sanitiser would prefix them again).
 */
export function rehypePrefixFragmentLinks() {
  return (tree: Root): void => {
    visit(tree, "element", (node: Element) => {
      const href = node.properties?.href;
      if (typeof href === "string" && href.startsWith("#") && href.length > 1) {
        node.properties.href = `#${CLOBBER_PREFIX}${href.slice(1)}`;
      }
    });
  };
}
