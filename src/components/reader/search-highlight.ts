import { foldName } from "@/content/links/link-map";

/**
 * Matched-word segments for a search result's title and heading (US-222, FR-041; SA-MOD Search E3-S2, TC-517). Pure: the
 * dialog renders each segment as React text, with a `<mark>` around `match: true`, so a hostile title is never parsed as
 * markup and no pattern is built from the query.
 *
 * The text is split with MiniSearch 7.2.0's own default separator class (`SPACE_OR_PUNCTUATION`), each token is folded with
 * `foldName` (the index's `processTerm`), and a token is a match when its folded form is one of the result's `terms`, which
 * are the matched INDEXED terms (a prefix or fuzzy query gives the full indexed word). `search-highlight.test.ts` pins that
 * this split agrees with MiniSearch's default tokenizer, because `SEARCH_OPTIONS` sets none.
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** MiniSearch 7.2.0's default separator class: line breaks, Unicode separators and punctuation. */
export const SEARCH_SEPARATOR = /[\n\r\p{Z}\p{P}]+/gu;

/** Segments that join back to `text`; a run of separators and an unmatched token are `match: false`, each matched token is its own segment. */
export function highlightSegments(text: string, terms: readonly string[]): HighlightSegment[] {
  if (text === "") return [];
  const wanted = new Set(terms);
  const out: HighlightSegment[] = [];
  const push = (segment: HighlightSegment) => {
    const last = out[out.length - 1];
    if (last !== undefined && !last.match && !segment.match) last.text += segment.text;
    else out.push(segment);
  };
  const addToken = (token: string) => {
    if (token !== "") push({ text: token, match: wanted.size > 0 && wanted.has(foldName(token)) });
  };
  let from = 0;
  for (const separator of text.matchAll(SEARCH_SEPARATOR)) {
    addToken(text.slice(from, separator.index));
    push({ text: separator[0], match: false });
    from = separator.index + separator[0].length;
  }
  addToken(text.slice(from));
  return out;
}
