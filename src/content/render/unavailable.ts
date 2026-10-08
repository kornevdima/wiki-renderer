import type { Element, ElementContent } from "hast";
import { IMAGE_UNAVAILABLE_COPY, UNAVAILABLE_LABEL, UNAVAILABLE_TOOLTIP } from "./wikilink-copy";

/**
 * The ONE unavailable marker (US-081, W6-1; FR-038, SR-020; TC-216, TC-456). Every caller (an unresolved wikilink, a
 * missing or ambiguous note embed now; relative links in US-085 and image embeds in US-084 later) builds it here, so
 * there is one shape.
 *
 * ```html
 * <span class="wikilink-unavailable" title="This link has no target in this wiki.">Missing<span
 *   class="wikilink-unavailable-indicator" aria-hidden="true"></span><span
 *   class="wikilink-unavailable-text">unavailable link</span></span>
 * ```
 *
 * - One non-focusable, non-link element: no `a`, no `href`, no `tabindex`.
 * - The reason (not-found, ambiguous, traversal) never reaches the DOM: this function takes no reason, so there is
 *   nothing to vary (SR-020). The only input is the author's own visible text.
 * - The accessible text "unavailable link" is VISUALLY HIDDEN TEXT (`.wikilink-unavailable-text`, hidden by the
 *   `globals.css` rule), not an `aria-label` on a generic `span` (axe `aria-prohibited-attr`) and not a `role`.
 * - The indicator is an empty, `aria-hidden` element carrying a CSS class only; no inline SVG and no drawn art (BUG-015).
 * - `title` is the tooltip and the only attribute carrying copy.
 * - The visible text is the FIRST child, so inside an author `<a>` (where `rehypeTrustedLinks` emits plain text) it is
 *   the one node kept.
 */
export const WIKILINK_UNAVAILABLE_CLASS = "wikilink-unavailable";
export const UNAVAILABLE_INDICATOR_CLASS = "wikilink-unavailable-indicator";
export const UNAVAILABLE_TEXT_CLASS = "wikilink-unavailable-text";
/** Every class the marker emits; the schema and `rehypeStripAuthorAttrs` both derive from this one list. */
export const UNAVAILABLE_CLASS_TOKENS: readonly string[] = [
  WIKILINK_UNAVAILABLE_CLASS,
  UNAVAILABLE_INDICATOR_CLASS,
  UNAVAILABLE_TEXT_CLASS,
];

export function unavailableMarker(visibleText: string): Element {
  const children: ElementContent[] = [
    { type: "text", value: visibleText },
    { type: "element", tagName: "span", properties: { className: [UNAVAILABLE_INDICATOR_CLASS], ariaHidden: "true" }, children: [] },
    {
      type: "element",
      tagName: "span",
      properties: { className: [UNAVAILABLE_TEXT_CLASS] },
      children: [{ type: "text", value: UNAVAILABLE_LABEL }],
    },
  ];
  return {
    type: "element",
    tagName: "span",
    properties: { className: [WIKILINK_UNAVAILABLE_CLASS], title: UNAVAILABLE_TOOLTIP },
    children,
  };
}

/**
 * The image variant of the marker (US-084, W7-1; R-7 copy "Image unavailable"). Same element, same class, same
 * non-focusable, no-target-name rules, and the same absence of a reason: it takes NO argument, so an unresolved image
 * embed, a relative image that is missing, traversal-rejected or not an image at all all render byte-identical output.
 *
 * ```html
 * <span class="wikilink-unavailable">Image unavailable<span class="wikilink-unavailable-indicator" aria-hidden="true"></span></span>
 * ```
 *
 * The visible text already says what the marker is, so it carries no hidden "unavailable link" text (that label would
 * read "Image unavailable unavailable link") and no tooltip (the accepted tooltip speaks of a link; new copy needs
 * operator acceptance).
 */
export function unavailableImageMarker(): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [WIKILINK_UNAVAILABLE_CLASS] },
    children: [
      { type: "text", value: IMAGE_UNAVAILABLE_COPY },
      { type: "element", tagName: "span", properties: { className: [UNAVAILABLE_INDICATOR_CLASS], ariaHidden: "true" }, children: [] },
    ],
  };
}
