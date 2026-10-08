import MiniSearch from "minisearch";
import type { ParsedPage } from "@/content/render/types";
import { SEARCH_OPTIONS, sectionDocs } from "./doc";
import type { SearchDoc } from "./types";

/**
 * The per-wiki search index (US-089, SA-MOD Search §3, TR-020): one MiniSearch index per `(wiki, sha)`, built from the ONE
 * parse `content/runtime`'s `build` produced (BR-036), never from files or a second parse. Returns the JSON export the
 * route serves and the client loads with `SEARCH_OPTIONS`.
 *
 * Never throws (TC-470): `build()` calls this, so a throw would make the whole wiki unavailable. A page that cannot be
 * indexed contributes what it can, or nothing. `pages` and the `ParsedPage`s in it are only read (BR-038).
 */
export function buildSearchIndex(pages: Map<string, ParsedPage>): string {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  for (const page of pages.values()) {
    let docs: SearchDoc[];
    try {
      docs = sectionDocs(page);
    } catch {
      continue;
    }
    for (const doc of docs) {
      try {
        index.add(doc);
      } catch {
        // A document that cannot be added is skipped; the rest of the page and wiki are still indexed.
      }
    }
  }
  try {
    return JSON.stringify(index);
  } catch {
    return JSON.stringify(new MiniSearch<SearchDoc>(SEARCH_OPTIONS));
  }
}
