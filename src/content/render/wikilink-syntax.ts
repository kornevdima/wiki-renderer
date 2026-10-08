import type { Root as MdastRoot, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";

/**
 * The hand-rolled Obsidian wikilink recogniser (US-075, US-076; ADR-009 and SA-MOD Rendering pipeline
 * `wikilink-syntax.ts`: no `remark-wiki-link`). It runs inside `parseMarkdown`, so `[[...]]` is recognised exactly once
 * per page, into `wikilink` mdast nodes that `parsePages` freezes with the rest of the AST (BR-036). Resolution is NOT
 * done here: it needs the link map and happens at render time (`wikilink.ts`).
 *
 * It works on the `text` nodes of the finished mdast, so the places where `[[` is not link syntax are excluded by
 * construction: inline code, fenced and indented code, raw HTML (comments included) and the front matter are not `text`
 * nodes, and text inside a Markdown link or link reference (`[[[Other Note]]](x.md)`) is skipped. A GFM table cell
 * arrives here already split, with `\|` already turned into `|`, so `[[Note\|text]]` works and an unescaped `|` (which
 * GFM splits on before we see it) cannot form a link. Accepted limit: a wikilink must sit inside ONE text node, so one
 * that spans Markdown markup (`[[a *b* c]]`) stays literal.
 *
 * Grammar: `[[target]]`, `[[target|display]]`, `[[target#heading]]`, `[[target#heading|display]]`, and the same with a
 * leading `!` (an embed). The inner text has no `[`, `]` or newline, is at most `MAX_INNER` characters, and its
 * target is not empty after trimming, or (same-page form `[[#Heading]]`) it has a heading. `[[` must not be preceded by `[` and `]]` must not be followed by `]`. Anything
 * else stays literal. The scan is `indexOf`-driven with a bounded inner check, so it is linear in the text.
 */

/** Longest accepted inner text; bounds the per-candidate work so a run of `[[` cannot make the scan quadratic. */
export const MAX_INNER = 1000;

export interface Wikilink {
  type: "wikilink";
  /** The text `mdast-util-to-string` reads (headings, the search text): what the link shows. */
  value: string;
  /** The target as the author wrote it, trimmed, without any `#heading` or `|display` part. Empty for `[[#Heading]]`. */
  target: string;
  heading?: string;
  display?: string;
  embed: boolean;
  /** The source text of the whole construct, used when it must render literally (embeds, for now). */
  raw: string;
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikilink: Wikilink;
  }
}

/** What a wikilink shows: its display text, else the target as written with `#heading` in Obsidian's `Note > Heading`. */
export function wikilinkLabel(target: string, heading: string | undefined, display: string | undefined): string {
  if (display !== undefined) return display;
  if (target === "") return heading ?? "";
  return heading === undefined ? target : `${target} > ${heading}`;
}

function parseInner(inner: string): Omit<Wikilink, "type" | "embed" | "raw" | "value"> | undefined {
  const pipe = inner.indexOf("|");
  const targetPart = pipe < 0 ? inner : inner.slice(0, pipe);
  const display = pipe < 0 ? undefined : inner.slice(pipe + 1).trim() || undefined;
  const hash = targetPart.indexOf("#");
  const target = (hash < 0 ? targetPart : targetPart.slice(0, hash)).trim();
  const heading = hash < 0 ? undefined : targetPart.slice(hash + 1).trim() || undefined;
  // `[[#Heading]]` (empty target, a heading) is the same-page form (US-077); with no heading there is nothing to link.
  if (target === "" && heading === undefined) return undefined;
  return { target, ...(heading !== undefined ? { heading } : {}), ...(display !== undefined ? { display } : {}) };
}

/** Splits one text value into text and wikilink nodes; `undefined` when it holds no wikilink. */
export function splitWikilinks(value: string): (Text | Wikilink)[] | undefined {
  const out: (Text | Wikilink)[] = [];
  let last = 0;
  let from = 0;
  let close = -1;
  for (;;) {
    const open = value.indexOf("[[", from);
    if (open < 0) break;
    from = open + 1;
    if (close < open + 2) {
      close = value.indexOf("]]", open + 2);
      if (close < 0) break;
    }
    const embed = open > 0 && value[open - 1] === "!";
    if (!embed && open > 0 && value[open - 1] === "[") continue;
    if (value[close + 2] === "]" || close - open - 2 > MAX_INNER) continue;
    const inner = value.slice(open + 2, close);
    if (/[[\]\n]/.test(inner)) continue;
    const parsed = parseInner(inner);
    if (!parsed) continue;
    const start = embed ? open - 1 : open;
    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    out.push({
      type: "wikilink",
      ...parsed,
      value: wikilinkLabel(parsed.target, parsed.heading, parsed.display),
      embed,
      raw: value.slice(start, close + 2),
    });
    last = close + 2;
    from = last;
  }
  if (out.length === 0) return undefined;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/** Replaces wikilink text with `wikilink` nodes, in place, on a freshly parsed tree (never on a shared one). */
export function recogniseWikilinks(tree: MdastRoot): void {
  visit(tree, (node, index, parent) => {
    if (node.type === "link" || node.type === "linkReference") return SKIP;
    if (node.type !== "text" || parent === undefined || index === undefined) return undefined;
    const parts = splitWikilinks(node.value);
    if (!parts) return undefined;
    (parent.children as unknown[]).splice(index, 1, ...parts);
    return index + parts.length;
  });
}
