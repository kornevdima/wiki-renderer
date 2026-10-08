import MiniSearch from "minisearch";
import { pageHref } from "@/content/links/page-href";
import { CLOBBER_PREFIX } from "@/content/render/clobber-prefix";
import { SEARCH_OPTIONS } from "./doc";
import type { SearchDoc, SearchHit } from "./types";

/**
 * The browser half of search (SA-MOD Search §3; US-091, US-092; FR-041, FR-043, TR-021). Pure: no React, no Next, and
 * `fetch` is injectable, so everything here is unit-tested without a DOM.
 *
 * - `loadSearchIndex` fetches `/api/wikis/{wikiId}/search-index/{sha}` and `MiniSearch.loadJSON`s it with the ONE
 *   exported `SEARCH_OPTIONS` (any other options object silently breaks queries). The loaded index is cached by
 *   `${wikiId}:${sha}` at module scope for the browser session; concurrent callers share one in-flight promise. A
 *   failure is not cached, so a later open tries again (one request per open, never a loop).
 * - `querySearchIndex` trims, caps the query at `SEARCH_QUERY_MAX` characters and returns at most `SEARCH_MAX_RESULTS`
 *   rows, one per section, in MiniSearch score order. Title and aliases are indexed on every section doc, so a title
 *   query returns every section of that page (operator ruling OA-4: still one row per section, at most 20).
 * - `searchResultHref` builds the row link from `pageHref` and the sanitiser's `CLOBBER_PREFIX`.
 */
export const SEARCH_QUERY_MAX = 200;
export const SEARCH_MAX_RESULTS = 20;

export interface SearchRow extends SearchHit {
  /** The document id, `path#k`: unique per section, the list key. */
  id: string;
  /** The matched indexed terms (`result.terms`), `[]` when none; the dialog bolds the title and heading words in this set (E3-S2). */
  terms: string[];
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function searchIndexUrl(wikiId: string, sha: string): string {
  return `/api/wikis/${encodeURIComponent(wikiId)}/search-index/${encodeURIComponent(sha)}`;
}

export function searchIndexCacheKey(wikiId: string, sha: string): string {
  return `${wikiId}:${sha}`;
}

/** Thrown for any failure to obtain the index: non-200 (the stale-sha 404 included), network error or bad JSON. */
export class SearchIndexUnavailableError extends Error {
  constructor() {
    super("search index unavailable");
    this.name = "SearchIndexUnavailableError";
  }
}

export interface SearchIndexLoader {
  load(wikiId: string, sha: string): Promise<MiniSearch<SearchDoc>>;
  /** The index when its load has already succeeded, else `undefined` (no request, no promise). */
  peek(wikiId: string, sha: string): MiniSearch<SearchDoc> | undefined;
  /** Drops every cached index. */
  clear(): void;
}

export function createSearchIndexLoader(fetchFn: FetchLike): SearchIndexLoader {
  const cache = new Map<string, Promise<MiniSearch<SearchDoc>>>();
  const resolved = new Map<string, MiniSearch<SearchDoc>>();

  async function fetchIndex(wikiId: string, sha: string): Promise<MiniSearch<SearchDoc>> {
    try {
      const response = await fetchFn(searchIndexUrl(wikiId, sha));
      if (!response.ok || response.status !== 200) throw new SearchIndexUnavailableError();
      const text = await response.text();
      return MiniSearch.loadJSON<SearchDoc>(text, SEARCH_OPTIONS);
    } catch {
      throw new SearchIndexUnavailableError();
    }
  }

  return {
    load(wikiId, sha) {
      const key = searchIndexCacheKey(wikiId, sha);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const pending = fetchIndex(wikiId, sha);
      cache.set(key, pending);
      pending.then((index) => {
        if (cache.get(key) === pending) resolved.set(key, index);
      }, () => {});
      pending.catch(() => {
        if (cache.get(key) === pending) cache.delete(key);
      });
      return pending;
    },
    peek(wikiId, sha) {
      return resolved.get(searchIndexCacheKey(wikiId, sha));
    },
    clear() {
      cache.clear();
      resolved.clear();
    },
  };
}

/** The session-wide loader: the index cache lives in this module's scope (the browser bundle is one per tab). */
const browserLoader = createSearchIndexLoader((url) => fetch(url));

export function loadSearchIndex(wikiId: string, sha: string): Promise<MiniSearch<SearchDoc>> {
  return browserLoader.load(wikiId, sha);
}

export function peekSearchIndex(wikiId: string, sha: string): MiniSearch<SearchDoc> | undefined {
  return browserLoader.peek(wikiId, sha);
}

/** The rows for `query`: `[]` for an empty or whitespace-only query. Never throws on any text. */
export function querySearchIndex(index: MiniSearch<SearchDoc>, query: string): SearchRow[] {
  const q = query.trim().slice(0, SEARCH_QUERY_MAX).trim();
  if (q === "") return [];
  let results;
  try {
    results = index.search(q);
  } catch {
    return [];
  }
  return results.slice(0, SEARCH_MAX_RESULTS).map((r) => ({
    id: String(r.id),
    path: String(r.path),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    heading: String(r.heading ?? ""),
    score: r.score,
    terms: Array.isArray(r.terms) ? r.terms.map(String) : [],
  }));
}

/** The row's link: the page, plus `#user-content-<slug>` below a heading; the lead section (slug `""`) has no fragment. */
export function searchResultHref(wikiId: string, row: Pick<SearchHit, "path" | "slug">): string {
  const base = pageHref(wikiId, row.path);
  return row.slug === "" ? base : `${base}#${CLOBBER_PREFIX}${row.slug}`;
}
