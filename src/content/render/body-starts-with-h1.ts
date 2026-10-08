import type { Root as MdastRoot } from "mdast";

/**
 * True when the page body already opens with a level-1 heading (front matter aside). The one rule behind two decisions: the
 * reader skips its injected title (`page.tsx`) and the renderer splits that heading off as `leadHeading` (`render.ts`, US-220).
 * It lives here, in `content/render`, so neither side keeps a copy that could disagree.
 */
export function bodyStartsWithH1(ast: MdastRoot): boolean {
  const first = ast.children.find((node) => node.type !== "yaml");
  return first !== undefined && first.type === "heading" && first.depth === 1;
}
