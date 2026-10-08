import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * `rehypeFocusableTables` (US-189, TC-503; reviewed against ADR-008 as a security change). The reader scrolls a wide
 * table inside itself (`display: block; overflow-x: auto`), and a scroll box a keyboard cannot focus cannot be scrolled
 * by a keyboard. The pipeline emits a bare `<table>`, so this trusted step gives every `table` element `tabIndex` 0.
 *
 * Fix round 1 adds `pre`: a plain (non-Shiki) fence that overflows needs the same one tab stop Shiki's `pre` already has
 * (axe `scrollable-region-focusable`). The sanitiser schema admits `tabIndex` (`0` only) on `table` and `pre` and nowhere else;
 * `rehypeStripAuthorAttrs` still removes every author-written `tabIndex` before this step runs, so the only focusable
 * table is one this step made. It runs after the strip step and before the sanitiser (the sanitiser stays last). It adds
 * a focus stop, never a style, a role, a handler or a URL. A table that does not overflow is still one tab stop; the
 * server cannot measure overflow.
 */
export function rehypeFocusableTables() {
  return (tree: Root): void => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "table" || node.tagName === "pre") node.properties.tabIndex = 0;
    });
  };
}
