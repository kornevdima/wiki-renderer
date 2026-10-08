/**
 * Search module types (SA-MOD Search §3). Pure types: no runtime.
 */

/** One heading section of one page. `id` is the section's position, `${path}#${sectionIndex}` (0 = lead section). */
export interface SearchDoc {
  id: string;
  path: string;
  /** `""` for the lead section (the text before the first heading). */
  heading: string;
  /** The parse-time heading id (TR-019), kept as written; `""` for the lead section. Never re-slugged here. */
  slug: string;
  title: string;
  aliases: string[];
  /** Flattened section body (visible text only, OA-1). */
  text: string;
}

export interface SearchHit {
  path: string;
  slug: string;
  title: string;
  heading: string;
  score: number;
  snippet?: string;
  /** The indexed terms MiniSearch matched (folded, a prefix or fuzzy match gives the full indexed term). Query-time only (E3-S2). */
  terms?: string[];
}
