import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { CALLOUT_CLASS_TOKENS } from "./callouts";
import { HEADING_ANCHOR_CLASS } from "./heading-outline";
import { EMBED_CLASS_TOKENS } from "./embed";
import { EXTERNAL_CLASS_TOKENS } from "./links";
import { WIKILINK_CLASS_TOKENS } from "./wikilink";

/**
 * `rehypeStripAuthorAttrs` (SA-MOD Rendering pipeline, Amendment 2026-09-30, S6-A6). Runs straight after
 * `rehypeRaw`, before any trusted step, so at that point every element still carries only what the author (or
 * `remark-rehype` from plain Markdown) wrote. It removes the reserved attributes below from EVERY element; whatever
 * survives to the sanitiser was therefore added by a trusted step. The schema admits the exact value, and an author
 * can type that exact value into raw HTML, so the look-alike has to die here, not in the schema.
 *
 * ONE list, extended by later waves (`role`, `target`, `rel`). Names are hast property names (`dataMermaidId`, not
 * `data-mermaid-id`). Shipped so far: the `data-mermaid-*` prefix (wave 1, which also covers the caption marker), and
 * in wave 2 `style` and `tabIndex` (Shiki writes both; `style` is what the ruled `style-src-attr 'unsafe-inline'`
 * would otherwise let an author restyle the page with) plus the S06-owned class tokens Shiki emits. Wave 4 adds the wikilink class tokens (`wikilink.ts`); wave 6 the unavailable marker's indicator and hidden-text tokens (`unavailable.ts`) and the embed tokens (`embed.ts`; the embed wrapper's nonce is removed by `rehypeNoteEmbeds`). Wave 7 adds `target` and `rel` (set together by `links.ts` on external links only) and the external-link class tokens. US-219 adds `heading-anchor` (the trusted copy anchor, `heading-anchors.ts`). Wave 3 adds `role` and `ariaHidden` (the callout container and its icon) and the callout class names (`callouts.ts`).
 */
export const RESERVED_PROPERTY_PREFIXES: readonly string[] = ["dataMermaid"];
export const RESERVED_PROPERTIES: readonly string[] = ["style", "tabIndex", "role", "ariaHidden", "target", "rel"];
/**
 * Individual `class` tokens an author cannot write; any other class on the element is left alone. Accepted (W2-19):
 * `line` is stripped from every element, not just `span`. Nothing else renders it, so this is harmless.
 */
export const RESERVED_CLASS_TOKENS: readonly string[] = ["shiki", "css-variables", "line", ...CALLOUT_CLASS_TOKENS, ...WIKILINK_CLASS_TOKENS, ...EMBED_CLASS_TOKENS, ...EXTERNAL_CLASS_TOKENS, HEADING_ANCHOR_CLASS];

function isReserved(name: string): boolean {
  return RESERVED_PROPERTIES.includes(name) || RESERVED_PROPERTY_PREFIXES.some((p) => name.startsWith(p));
}

export function rehypeStripAuthorAttrs() {
  return (tree: Root): void => {
    visit(tree, "element", (node: Element) => {
      const props = node.properties;
      if (!props) return;
      for (const name of Object.keys(props)) {
        if (isReserved(name)) delete props[name];
      }
      // Only `rehypeTaskLabels` may name a checkbox: an author `aria-labelledby` on an `input` dies here.
      if (node.tagName === "input") delete props.ariaLabelledBy;
      const classes = props.className;
      if (Array.isArray(classes)) {
        const kept = classes.filter((c) => !(typeof c === "string" && RESERVED_CLASS_TOKENS.includes(c)));
        if (kept.length === 0) delete props.className;
        else if (kept.length !== classes.length) props.className = kept;
      }
    });
  };
}
