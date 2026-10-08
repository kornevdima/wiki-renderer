import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * The final guard that no two elements share an `id` (W6-4, TC-450; the wave 5 review lesson: never let two elements
 * silently share an id). `rehypeNoteEmbeds` namespaces the ids of each embedded note, which covers the notes' own ids;
 * this covers what is left, such as an author's raw-HTML `id` in the host that equals a generated one, or the same id
 * written twice in one note. The first element (document order) keeps its id. Each later one gets `<id>-dup-<k>` with
 * the smallest `k` whose result is not an existing id at all, so a renamed id can never land on another element's.
 * Hrefs are left alone: a link to the shared id goes to the first element, as a browser would resolve it anyway.
 * Runs before `rehypePrefixFragmentLinks` and the sanitiser, on un-prefixed ids.
 */
export function rehypeUniqueIds() {
  return (tree: Root): void => {
    const all = new Set<string>();
    const elements: Element[] = [];
    visit(tree, "element", (node: Element) => {
      const id = node.properties?.id;
      if (typeof id === "string" && id !== "") {
        all.add(id);
        elements.push(node);
      }
    });
    const seen = new Set<string>();
    for (const el of elements) {
      const id = el.properties.id as string;
      if (!seen.has(id)) {
        seen.add(id);
        continue;
      }
      let k = 1;
      while (all.has(`${id}-dup-${k}`)) k++;
      const next = `${id}-dup-${k}`;
      all.add(next);
      seen.add(next);
      el.properties.id = next;
    }
  };
}
