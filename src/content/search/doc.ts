import type { Options, SearchOptions } from "minisearch";
import { foldName } from "@/content/links/link-map";
import type { ParsedPage } from "@/content/render/types";
import type { SearchDoc } from "./types";

/**
 * Heading-section documents and the ONE MiniSearch options object (SA-MOD Search §3, §9; TR-020). The server builds with
 * `SEARCH_OPTIONS` and the client's `MiniSearch.loadJSON` must be given the same object: a build/load options mismatch
 * silently breaks queries. Pure: reads `ParsedPage`, never the source files and never a parser (BR-036).
 */

/** Provisional edit-distance ratio for fuzzy matching; US-093 / US-140 tune it. */
export const SEARCH_FUZZY = 0.2;

/** Field boosts (TR-020): title and aliases above heading, above body. */
export const SEARCH_BOOST = Object.freeze({ title: 3, aliases: 3, heading: 2, text: 1 });

/**
 * Terms are folded exactly as link resolution folds names (NFC, then `toLowerCase`, `foldName`): no diacritic folding,
 * so `cafe` does not find `café` (OA-3). Applied to indexed text and to queries alike.
 */
function processTerm(term: string): string {
  return foldName(term);
}

const searchOptions: SearchOptions = { boost: { ...SEARCH_BOOST }, prefix: true, fuzzy: SEARCH_FUZZY };

export const SEARCH_OPTIONS: Options<SearchDoc> = Object.freeze({
  idField: "id",
  fields: ["title", "aliases", "heading", "text"],
  storeFields: ["path", "slug", "title", "heading"],
  processTerm,
  searchOptions,
});

const SECTION_MARK = "\u001e";

/**
 * One document per heading section of `page`, lead section first (`id` `path#0`), always emitted: even when the page has
 * no prose before its first heading (or none at all, TC-226), so a title or alias hit has a page-top target and every
 * page contributes at least one document. `rawText` sections are `"\u001e" + slug + "\n" + lines` (see
 * `ParsedPage.rawText`) and the parser omits an empty lead section from a page that has headings, so the lead's text is
 * present exactly when there is one more section than headings.
 */
export function sectionDocs(page: ParsedPage): SearchDoc[] {
  const parts = page.rawText.split(SECTION_MARK);
  const preamble = parts[0] ?? "";
  const sections = parts.slice(1);
  const leadInText = sections.length === page.headings.length + 1 || page.headings.length === 0;
  const base = { path: page.path, title: page.title, aliases: page.aliases };

  const leadBody = leadInText && sections.length > 0 ? bodyOf(sections[0]!) : "";
  const docs: SearchDoc[] = [
    { ...base, id: `${page.path}#0`, heading: "", slug: "", text: [preamble, leadBody].filter((t) => t !== "").join("\n") },
  ];
  // Section k is heading k - 1 when the lead is in the text, else heading k; the id counts the lead as 0.
  const offset = leadInText ? 0 : 1;
  for (let k = leadInText ? 1 : 0; k < sections.length; k += 1) {
    const section = sections[k]!;
    const nl = section.indexOf("\n");
    const slug = nl < 0 ? section : section.slice(0, nl);
    const rest = nl < 0 ? "" : section.slice(nl + 1);
    const nl2 = rest.indexOf("\n");
    const heading = nl2 < 0 ? rest : rest.slice(0, nl2);
    const text = nl2 < 0 ? "" : rest.slice(nl2 + 1);
    docs.push({ ...base, id: `${page.path}#${k + offset}`, heading, slug, text });
  }
  return docs;
}

function bodyOf(section: string): string {
  const nl = section.indexOf("\n");
  return nl < 0 ? "" : section.slice(nl + 1);
}
