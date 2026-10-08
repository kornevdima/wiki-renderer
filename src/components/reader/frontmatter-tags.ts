import { isLinkedText, TRUNCATED } from "@/content/render/frontmatter-view";

/**
 * The Properties panel's tag chips (US-188, FR-023 via CR-006). Only the top-level `tags` field becomes chips, and only when
 * it is a non-empty list of plain scalars (strings, numbers, booleans). Anything else (a single string, a map, a nested list,
 * an item holding a wikilink, an empty item) keeps the ordinary term/value rendering, so no value is ever dropped or reshaped.
 * The `(truncated)` marker the view appends to a long list is the list's truncation marker, not a tag: it is split off
 * (`truncated: true`) and the panel shows it as plain text after the chips, as it does for any other truncated value.
 * Pure data: the result is text for React to escape, never markup (US-108).
 */
export const TAGS_KEY = "tags";

export interface TagChips {
  chips: string[];
  truncated: boolean;
}

export function tagChips(key: string, value: unknown): TagChips | null {
  if (key !== TAGS_KEY || !Array.isArray(value) || value.length === 0) return null;
  const chips: string[] = [];
  let truncated = false;
  for (const [index, item] of value.entries()) {
    if (index === value.length - 1 && item === TRUNCATED && value.length > 1) {
      truncated = true;
      continue;
    }
    if (isLinkedText(item)) return null;
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") return null;
    const text = String(item);
    if (text.trim() === "") return null;
    chips.push(text);
  }
  return { chips, truncated };
}
