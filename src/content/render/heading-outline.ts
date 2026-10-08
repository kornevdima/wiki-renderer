import type { Element, Nodes, Root } from "hast";
import { visit } from "unist-util-visit";
import { EMBED_CLASS_TOKENS } from "./embed";
import { EXTERNAL_TEXT_CLASS } from "./links";
import { UNAVAILABLE_TEXT_CLASS } from "./unavailable";
import type { OutlineEntry } from "./types";

/** The class of the trusted anchor `rehypeHeadingAnchors` appends to an outline heading. Reserved: an author cannot write it. */
export const HEADING_ANCHOR_CLASS = "heading-anchor";

/** The footnote section's visually hidden heading carries this class; it is the page's machinery, not one of its sections. */
const SR_ONLY_CLASS = "sr-only";

function classesOf(node: Element): readonly string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.filter((c): c is string => typeof c === "string") : [];
}

/**
 * The pipeline's visually hidden notes ("(opens in a new tab)", "(page not found)"): spoken after a link's text, but not part of
 * the heading's wording, so they stay out of an outline entry and an anchor's name. Reserved classes, so an author cannot write them.
 */
const HIDDEN_NOTE_CLASSES: readonly string[] = [EXTERNAL_TEXT_CLASS, UNAVAILABLE_TEXT_CLASS];

/** Plain text of a node with every run of whitespace collapsed to one space and the ends trimmed. No markup survives. */
export function plainText(node: Nodes): string {
  let text = "";
  const walk = (current: Nodes): void => {
    if (current.type === "text") text += current.value;
    else if (current.type === "element" && classesOf(current).some((c) => HIDDEN_NOTE_CLASSES.includes(c))) return;
    else if ("children" in current) for (const child of current.children) walk(child);
  };
  walk(node);
  return text.replace(/\s+/g, " ").trim();
}

/**
 * THE one predicate (SA-MOD Reader UI and print E3-D2; US-219, operator "Exclude embedded headings"). A heading is one of the
 * page's own sections, and so gets a copy anchor AND an "On this page" entry, exactly when it is an `h2` or `h3` with a
 * non-empty string `id`, is not inside an embedded note or an embed marker, does not carry `sr-only` (the footnotes heading),
 * and has plain text. Raw-HTML headings without an `id` therefore get neither. The anchor step and the outline collector both
 * call this, so "a list entry without an anchor" and "an anchor without an entry" cannot happen.
 */
export function isOutlineHeading(node: Element, ancestors: readonly (Root | Element)[]): boolean {
  if (node.tagName !== "h2" && node.tagName !== "h3") return false;
  const id = node.properties?.id;
  if (typeof id !== "string" || id === "") return false;
  if (classesOf(node).includes(SR_ONLY_CLASS)) return false;
  for (const ancestor of ancestors) {
    if (ancestor.type === "element" && classesOf(ancestor).some((c) => EMBED_CLASS_TOKENS.includes(c))) return false;
  }
  return plainText(node) !== "";
}

function isAnchor(node: Element["children"][number]): boolean {
  return node.type === "element" && node.tagName === "a" && classesOf(node).includes(HEADING_ANCHOR_CLASS);
}

/**
 * The page's outline, read from the FINAL (sanitised) hast: every `h2` / `h3` that carries the trusted anchor as a direct
 * child, in document order, with the id that is in the document (`user-content-…`, with any `-dup-k` rename) and its plain text.
 * It never reads `ParsedPage.headings`, which cannot see a rename or the exclusions above. The anchor is empty, so the text is
 * the heading's own. An author cannot forge the anchor class (`RESERVED_CLASS_TOKENS`), so the set is the pipeline's alone.
 */
export function collectOutline(hast: Root): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  visit(hast, "element", (node: Element) => {
    if (node.tagName !== "h2" && node.tagName !== "h3") return;
    const id = node.properties?.id;
    if (typeof id !== "string" || id === "") return;
    if (!node.children.some(isAnchor)) return;
    entries.push({ depth: node.tagName === "h2" ? 2 : 3, id, text: plainText(node) });
  });
  return entries;
}
