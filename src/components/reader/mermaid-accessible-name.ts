/**
 * The accessible name of a drawn diagram (US-192, FR-027). Mermaid 12.0.0 emits `role="graphics-document document"` with an
 * `aria-roledescription` of the diagram type, and names the svg only when the author wrote `accTitle` (then `aria-labelledby`
 * points at a `<title id>` inside it). Ruling "Author's title, else generic": a drawn diagram is an image named by the author's
 * `accTitle` when the source has one, otherwise by the generic name (the `mermaid.diagramName` copy, "Diagram").
 *
 * Exactly one name, on the svg, by one mechanism: `aria-label`. The `aria-labelledby` is removed (it would outrank the label and
 * name the svg twice over), and so is the roledescription (it would read "flowchart-v2" after the name). `<title>` stays as the
 * hover tooltip; `accDescr`, if the author wrote one, stays as the description (`aria-describedby` to a `<desc id>`). The
 * placeholder `div` stays unnamed, so nothing announces twice. The svg's children are presentational under `role="img"`.
 *
 * Pure DOM-attribute handling on the parsed (still inert) svg, before it is attached; no `mermaid` import, no colour, no script.
 */
export interface SvgElementLike {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(selector: string): Iterable<{ getAttribute(name: string): string | null; textContent: string | null }>;
}

/** The author's `accTitle`, if the svg carries one that `aria-labelledby` names; otherwise `undefined`. */
export function authorTitleOf(svg: SvgElementLike): string | undefined {
  const labelledBy = svg.getAttribute("aria-labelledby")?.trim();
  if (!labelledBy) return undefined;
  const ids = new Set(labelledBy.split(/\s+/));
  for (const title of svg.querySelectorAll("title")) {
    const id = title.getAttribute("id");
    if (id !== null && ids.has(id)) {
      const text = (title.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }
  return undefined;
}

/** Names the drawn svg: the author's title, else `fallback`. Returns the name it set. */
export function nameDrawnDiagram(svg: SvgElementLike, fallback: string): string {
  const name = authorTitleOf(svg) ?? fallback;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", name);
  svg.removeAttribute("aria-labelledby");
  svg.removeAttribute("aria-roledescription");
  return name;
}
