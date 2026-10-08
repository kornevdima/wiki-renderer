import { parseFragment } from "parse5";
import { expect } from "vitest";

/**
 * Shared HTML fixtures for the render specs that emit blocks or images (wave 6 `embeds.test.ts`, wave 7 `links.test.ts`).
 */
// `link` is here because React 19 hoists a `<link rel="preload" as="image">` for every `<img>` it renders (wave 7).
const VOID = new Set(["br", "hr", "img", "input", "wbr", "link"]);
type P5Node = { nodeName: string; tagName?: string; childNodes?: P5Node[] };
function tagsOfTree(node: P5Node, out: string[]): string[] {
  for (const child of node.childNodes ?? []) {
    if (child.tagName === undefined) continue;
    const tag = child.tagName.toLowerCase();
    if (VOID.has(tag)) continue;
    out.push(tag);
    tagsOfTree(child, out);
    out.push(`/${tag}`);
  }
  return out;
}
/**
 * Well-formedness: the browser's parse of the server HTML must have the same element structure as the server wrote, so
 * nothing is repaired on the client (no hydration mismatch). Compares the open/close tag sequence of the string with the
 * parse5 tree of it (parse5 is what `rehype-raw` and the browser's algorithm share).
 */
export function assertWellFormed(out: string): void {
  const written = [...out.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)]
    .filter((m) => !VOID.has(m[2]!.toLowerCase()))
    .map((m) => `${m[1]}${m[2]!.toLowerCase()}`);
  expect(tagsOfTree(parseFragment(out) as unknown as P5Node, [])).toEqual(written);
}
/** Every `.note-embed` and `.embed-marker` parent is flow content: never a heading, `p`, or phrasing element. */
export function blockParents(out: string): string[] {
  const root = parseFragment(out) as unknown as P5Node;
  const bad: string[] = [];
  const walk = (node: P5Node): void => {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === undefined) continue;
      const parent = node.tagName?.toLowerCase();
      const cls = ((child as unknown as { attrs: { name: string; value: string }[] }).attrs ?? []).find((a) => a.name === "class")?.value;
      if ((cls === "note-embed" || cls === "embed-marker") && parent !== undefined && !["div", "li", "td", "th", "blockquote", "section"].includes(parent)) bad.push(parent);
      walk(child);
    }
  };
  walk(root);
  return bad;
}
