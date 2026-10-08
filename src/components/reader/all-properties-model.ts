import { MAX_ITEMS, TRUNCATED } from "@/content/render/frontmatter-view";
import type { FrontmatterField } from "@/content/render/types";

/**
 * The All properties rows and their count (US-220, FR-023 via CR-008, SA-MOD Reader UI and print E3-5; TC-515). Pure.
 *
 * Every key is a row, for every reader: there is no filter here and none may be added (operator ruling 2026-10-07). The count is
 * the number of rows listed, which is the number of top-level keys: a nested value counts once, an empty value still counts.
 * When the view cut keys at its bound it appended a `(truncated)` sentinel field; that is not a key, so it is split off
 * (`truncated: true`) and drawn as a mark after the list, never as a row and never counted. The count therefore never exceeds
 * the rows shown, and the mark says more exist.
 */
export interface PropertyRows {
  rows: FrontmatterField[];
  count: number;
  truncated: boolean;
}

export function propertyRows(fields: readonly FrontmatterField[]): PropertyRows {
  const last = fields[fields.length - 1];
  const truncated = fields.length === MAX_ITEMS + 1 && last !== undefined && last.key === TRUNCATED && last.value === TRUNCATED;
  const rows = truncated ? fields.slice(0, -1) : [...fields];
  return { rows, count: rows.length, truncated };
}
