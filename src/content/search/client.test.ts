import MiniSearch from "minisearch";
import { describe, expect, it, vi } from "vitest";

import {
  SEARCH_MAX_RESULTS,
  SEARCH_QUERY_MAX,
  createSearchIndexLoader,
  querySearchIndex,
  searchIndexUrl,
  searchResultHref,
  type FetchLike,
} from "./client";
import { SEARCH_OPTIONS } from "./doc";
import type { SearchDoc } from "./types";

function doc(path: string, k: number, over: Partial<SearchDoc> = {}): SearchDoc {
  return { id: `${path}#${k}`, path, heading: "", slug: "", title: path, aliases: [], text: "", ...over };
}

function indexJson(docs: SearchDoc[]): string {
  const ms = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  ms.addAll(docs);
  return JSON.stringify(ms);
}

const ok = (body: string): ReturnType<FetchLike> => Promise.resolve({ ok: true, status: 200, text: async () => body });
const refuse = (status = 404): ReturnType<FetchLike> => Promise.resolve({ ok: false, status, text: async () => "" });
const BODY = indexJson([doc("a.md", 0, { title: "Alpha", text: "body only zebra" }), doc("a.md", 1, { title: "Alpha", heading: "Setup", slug: "setup", text: "install" })]);

describe("loader cache (D2, TC-475, TC-477)", () => {
  it("fetches the sha-qualified URL once per wiki+sha, then answers from the cache", async () => {
    const fetchFn = vi.fn<FetchLike>(() => ok(BODY));
    const loader = createSearchIndexLoader(fetchFn);
    const first = await loader.load("w1", "s".repeat(40));
    const second = await loader.load("w1", "s".repeat(40));
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`/api/wikis/w1/search-index/${"s".repeat(40)}`);
  });

  it("concurrent opens share one in-flight request", async () => {
    const fetchFn = vi.fn<FetchLike>(() => ok(BODY));
    const loader = createSearchIndexLoader(fetchFn);
    await Promise.all([loader.load("w1", "a1"), loader.load("w1", "a1"), loader.load("w1", "a1")]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("a second wiki fetches once of its own and never answers from the first", async () => {
    const other = indexJson([doc("b.md", 0, { title: "Bravo", text: "only here" })]);
    const fetchFn = vi.fn<FetchLike>((url) => ok(url.includes("/w2/") ? other : BODY));
    const loader = createSearchIndexLoader(fetchFn);
    const one = await loader.load("w1", "s1");
    const two = await loader.load("w2", "s1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(two).not.toBe(one);
    expect(querySearchIndex(two, "zebra")).toEqual([]);
    expect(querySearchIndex(one, "zebra")).toHaveLength(1);
    await loader.load("w2", "s1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("a new sha fetches the new index once and never answers from the old", async () => {
    const fresh = indexJson([doc("a.md", 0, { title: "Alpha", text: "fresh yak" })]);
    const fetchFn = vi.fn<FetchLike>((url) => ok(url.endsWith("/new") ? fresh : BODY));
    const loader = createSearchIndexLoader(fetchFn);
    const old = await loader.load("w1", "old");
    const next = await loader.load("w1", "new");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(querySearchIndex(old, "yak")).toEqual([]);
    expect(querySearchIndex(next, "yak")).toHaveLength(1);
    expect(searchIndexUrl("w 1", "x")).toBe("/api/wikis/w%201/search-index/x");
  });
});

describe("peek (no loading flash on re-open)", () => {
  it("is undefined before the load resolves and the cached index after", async () => {
    const loader = createSearchIndexLoader(() => ok(BODY));
    expect(loader.peek("w", "s")).toBeUndefined();
    const pending = loader.load("w", "s");
    expect(loader.peek("w", "s")).toBeUndefined();
    const index = await pending;
    await Promise.resolve();
    expect(loader.peek("w", "s")).toBe(index);
    expect(loader.peek("w", "other")).toBeUndefined();
  });
});

describe("loader failure (D4, TC-228)", () => {
  it.each([[404], [500], [403]])("a %i rejects with the unavailable error", async (status) => {
    const loader = createSearchIndexLoader(() => refuse(status));
    await expect(loader.load("w", "s")).rejects.toMatchObject({ name: "SearchIndexUnavailableError" });
  });

  it("a network error and an unparseable body reject the same way", async () => {
    await expect(createSearchIndexLoader(() => Promise.reject(new TypeError("net"))).load("w", "s")).rejects.toMatchObject({
      name: "SearchIndexUnavailableError",
    });
    await expect(createSearchIndexLoader(() => ok("not json")).load("w", "s")).rejects.toMatchObject({ name: "SearchIndexUnavailableError" });
  });

  it("a failure is not cached: the next open asks again, once", async () => {
    let calls = 0;
    const loader = createSearchIndexLoader(() => (++calls === 1 ? refuse() : ok(BODY)));
    await expect(loader.load("w", "s")).rejects.toBeDefined();
    await expect(loader.load("w", "s")).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
});

describe("querySearchIndex (D3, TC-476)", () => {
  const index = MiniSearch.loadJSON<SearchDoc>(BODY, SEARCH_OPTIONS);

  it("finds a body-only match, with the heading and slug of its section", () => {
    const rows = querySearchIndex(index, "zebra");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a.md#0", path: "a.md", slug: "", title: "Alpha", heading: "" });
    expect(querySearchIndex(index, "install")[0]).toMatchObject({ id: "a.md#1", slug: "setup", heading: "Setup" });
  });

  it("a title query returns every section of the page, one row each", () => {
    expect(querySearchIndex(index, "alpha").map((r) => r.id).sort()).toEqual(["a.md#0", "a.md#1"]);
  });

  it("empty and whitespace-only queries return no rows", () => {
    expect(querySearchIndex(index, "")).toEqual([]);
    expect(querySearchIndex(index, " \t\n ")).toEqual([]);
  });

  it("caps the query at 200 characters before searching", () => {
    const spy = vi.spyOn(index, "search");
    querySearchIndex(index, `${"x".repeat(SEARCH_QUERY_MAX)}zebra`);
    expect(spy.mock.calls[0]![0]).toBe("x".repeat(SEARCH_QUERY_MAX));
    spy.mockRestore();
  });

  it("returns at most 20 rows", () => {
    const docs = Array.from({ length: 45 }, (_, k) => doc("big.md", k, { title: "Big", heading: `H${k}`, slug: `h${k}`, text: "needle" }));
    const big = MiniSearch.loadJSON<SearchDoc>(indexJson(docs), SEARCH_OPTIONS);
    expect(querySearchIndex(big, "needle")).toHaveLength(SEARCH_MAX_RESULTS);
  });

  it("never throws on special characters or a very long query", () => {
    for (const q of ["(", "*", "\\", "\u0000", "<img src=x onerror=1>", "😀".repeat(500), "a".repeat(50_000)]) {
      expect(() => querySearchIndex(index, q)).not.toThrow();
    }
  });
});

describe("querySearchIndex: matched terms (US-222, E3-S2; MiniSearch 7.2.0 result.terms)", () => {
  const docs = [
    doc("arch.md", 0, { title: "Architecture of the Café pipeline", text: "an archive of notes" }),
    doc("plain.md", 0, { title: "Plain", text: "only body mentions zebra" }),
  ];
  const index = MiniSearch.loadJSON<SearchDoc>(indexJson(docs), SEARCH_OPTIONS);
  const terms = (q: string, id: string) => querySearchIndex(index, q).find((r) => r.id === id)?.terms;

  it("an exact query returns the indexed term", () => {
    expect(terms("pipeline", "arch.md#0")).toEqual(["pipeline"]);
  });
  it("a prefix query returns the full indexed terms, from any field (the body's 'archive' too)", () => {
    expect(terms("arch", "arch.md#0")?.sort()).toEqual(["architecture", "archive"]);
  });
  it("a fuzzy query returns the folded indexed term: 'cafe' finds 'café' by edit distance, not by diacritic folding (OA-3)", () => {
    expect(terms("cafe", "arch.md#0")).toEqual(["café"]);
  });
  it("a body-only match still carries its terms (the dialog marks only the title and heading it shows)", () => {
    expect(terms("zebra", "plain.md#0")).toEqual(["zebra"]);
  });
  it("every row has a terms array", () => {
    for (const row of querySearchIndex(index, "pipeline zebra")) expect(Array.isArray(row.terms)).toBe(true);
  });
});

describe("searchResultHref (US-092, D5, TC-478)", () => {
  it("a heading section links to the user-content id; the lead has no fragment", () => {
    expect(searchResultHref("w1", { path: "guide/setup.md", slug: "install-it" })).toBe("/w/w1/guide/setup.md#user-content-install-it");
    expect(searchResultHref("w1", { path: "guide/setup.md", slug: "" })).toBe("/w/w1/guide/setup.md");
  });

  it("paths with #, %, spaces and non-ASCII round-trip through the shared encoder", () => {
    const path = "docs/a #1 100% café.md";
    const href = searchResultHref("w 1", { path, slug: "x" });
    expect(href).toBe("/w/w%201/docs/a%20%231%20100%25%20caf%C3%A9.md#user-content-x");
    const pathname = href.split("#user-content-")[0]!;
    expect(pathname.split("/").slice(3).map(decodeURIComponent).join("/")).toBe(path);
  });
});
