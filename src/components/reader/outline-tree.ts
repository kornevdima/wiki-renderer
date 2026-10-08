import type { OutlineEntry } from "@/content/render/types";

/**
 * The "On this page" list's shape (US-219, FR-053, SA-MOD Reader UI and print E3-2). Pure.
 *
 * The list shows only when the page has at least `OUTLINE_MIN` entries (h2 and h3 together); with fewer there is no list, no
 * heading and no placeholder. An h3 nests under the nearest preceding h2; an h3 before any h2 is top level. The input is
 * `RenderedPage.outline`, flat and in document order; this never reorders, drops or renames an entry.
 */
export const OUTLINE_MIN = 3;

export function showsOutline(outline: readonly OutlineEntry[] | undefined): boolean {
  return outline !== undefined && outline.length >= OUTLINE_MIN;
}

export interface OutlineGroup {
  entry: OutlineEntry;
  children: OutlineEntry[];
}

export function groupOutline(outline: readonly OutlineEntry[]): OutlineGroup[] {
  const groups: OutlineGroup[] = [];
  let lastH2: OutlineGroup | undefined;
  for (const entry of outline) {
    if (entry.depth === 3 && lastH2 !== undefined) {
      lastH2.children.push(entry);
      continue;
    }
    const group: OutlineGroup = { entry, children: [] };
    groups.push(group);
    if (entry.depth === 2) lastH2 = group;
  }
  return groups;
}
