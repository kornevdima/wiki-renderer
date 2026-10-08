import type { Element, Root } from "hast";
import { headingAnchorLabel } from "./heading-anchor-copy";
import { HEADING_ANCHOR_CLASS, isOutlineHeading, plainText } from "./heading-outline";

/**
 * `rehypeHeadingAnchors` (US-219, SA-MOD Rendering pipeline E3-A1, ADR-008 amendment 2026-10-07). A trusted step that appends an
 * empty `a.heading-anchor[href="#<id>"][aria-label]` as the last child of every outline heading (`isOutlineHeading`), so a
 * reader can copy that section's address. It runs after `rehypeUniqueIds` (the id is final, a `-dup-k` rename included) and
 * before `rehypePrefixFragmentLinks`, which prefixes the `href` exactly as it does an author's `[x](#setup)`; the sanitiser
 * prefixes the heading's `id`. The class is reserved (`RESERVED_CLASS_TOKENS`), so an author's look-alike was removed before
 * this step. No icon is in the markup: it is a CSS mask (`wr-reader.css`), because inline SVG does not survive the sanitiser.
 * It edits the per-render hast only; the parse, the search index and the link map never see the anchor.
 */
export function rehypeHeadingAnchors() {
  return (tree: Root): void => {
    const ancestors: (Root | Element)[] = [];
    const walk = (parent: Root | Element): void => {
      ancestors.push(parent);
      // Snapshot the children: an anchor appended to a heading must not be walked itself.
      for (const child of [...parent.children]) {
        if (child.type !== "element") continue;
        if (isOutlineHeading(child, ancestors)) {
          const id = child.properties.id as string;
          child.children.push({
            type: "element",
            tagName: "a",
            properties: { className: [HEADING_ANCHOR_CLASS], href: `#${id}`, ariaLabel: headingAnchorLabel(plainText(child)) },
            children: [],
          });
        }
        walk(child);
      }
      ancestors.pop();
    };
    walk(tree);
  };
}
