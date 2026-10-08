import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * `rehypeTaskLabels` (US-189 fix round 1; reviewed against ADR-008). A GFM task-list checkbox is an `<input>` with no
 * accessible name (axe `label`). This trusted step names each one from its own item text, with no new copy: the run of
 * inline siblings after the checkbox (the item's own text, not a nested list or other block) is wrapped in a `<span>`
 * carrying a generated `id`, and the checkbox gets `ariaLabelledBy` pointing at it. The sanitiser prefixes both with
 * `CLOBBER_PREFIX` (they are in its clobber list), so the pair stays matched. The ids avoid every id already in the tree,
 * and the step runs before `rehypeUniqueIds`. An author's own `aria-labelledby` on a checkbox is replaced. A checkbox with
 * no text after it is left as it was. The checkbox stays `disabled` (read-only); this adds a name, never a handler.
 */
const INLINE = new Set(["a", "abbr", "b", "br", "code", "del", "em", "i", "img", "ins", "kbd", "mark", "q", "s", "span", "strong", "sub", "sup", "u"]);
const ID_PREFIX = "task-label-";

function isCheckbox(node: ElementContent): node is Element {
  return node.type === "element" && node.tagName === "input" && String(node.properties?.type) === "checkbox";
}

function hasText(nodes: ElementContent[]): boolean {
  return nodes.some((n) => (n.type === "text" ? n.value.trim() !== "" : n.type === "element" && n.tagName !== "br"));
}

export function rehypeTaskLabels() {
  return (tree: Root): void => {
    const taken = new Set<string>();
    visit(tree, "element", (node: Element) => {
      const id = node.properties?.id;
      if (typeof id === "string") taken.add(id);
    });
    let counter = 0;
    visit(tree, "element", (parent: Element) => {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (!isCheckbox(child)) continue;
        let end = i + 1;
        while (end < parent.children.length) {
          const next = parent.children[end];
          if (next.type === "element" && !INLINE.has(next.tagName)) break;
          if (next.type === "element" && isCheckbox(next)) break;
          end++;
        }
        const run = parent.children.slice(i + 1, end);
        if (!hasText(run)) continue;
        let id: string;
        do id = `${ID_PREFIX}${++counter}`;
        while (taken.has(id));
        taken.add(id);
        const span: Element = { type: "element", tagName: "span", properties: { id }, children: run };
        parent.children.splice(i + 1, run.length, span);
        child.properties.ariaLabelledBy = [id];
      }
    });
  };
}
