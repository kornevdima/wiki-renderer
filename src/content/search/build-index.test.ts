import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { parsePages } from "@/content/render/parse";
import type { ParsedPage } from "@/content/render/types";
import { buildSearchIndex } from "./build-index";
import { SEARCH_BOOST, SEARCH_FUZZY, SEARCH_OPTIONS } from "./doc";
import type { SearchDoc } from "./types";

const encoder = new TextEncoder();

function pagesOf(files: Record<string, string>): Map<string, ParsedPage> {
  const entries = new Map(Object.entries(files).map(([path, text]) => [path, { bytes: encoder.encode(text), contentType: "text/markdown" }]));
  return parsePages(entries);
}

function load(json: string): MiniSearch<SearchDoc> {
  return MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS);
}

function indexOf(files: Record<string, string>): MiniSearch<SearchDoc> {
  return load(buildSearchIndex(pagesOf(files)));
}

/** Exact-term search (no prefix, no fuzzy): what the folding and visibility rules are about, not the tuning. */
const exact = { prefix: false, fuzzy: false } as const;

function paths(ms: MiniSearch<SearchDoc>, query: string, options: Parameters<MiniSearch<SearchDoc>["search"]>[1] = exact): string[] {
  return ms.search(query, options).map((r) => r.path as string);
}

function docIds(ms: MiniSearch<SearchDoc>): string[] {
  return ms.search(MiniSearch.wildcard).map((r) => r.id as string);
}

describe("buildSearchIndex: one document per heading section (US-089 scenario 1)", () => {
  it("three headings give four documents (lead + 3), each carrying its own section text", () => {
    const ms = indexOf({
      "p.md": "lead zebra\n\n# One\n\nalpha body\n\n## Two\n\nbravo body\n\n### Three\n\ncharlie body\n",
    });
    expect(ms.documentCount).toBe(4);
    expect(docIds(ms).sort()).toEqual(["p.md#0", "p.md#1", "p.md#2", "p.md#3"]);
    const hit = (q: string) => ms.search(q, exact).map((r) => ({ id: r.id, heading: r.heading, slug: r.slug }));
    expect(hit("zebra")).toEqual([{ id: "p.md#0", heading: "", slug: "" }]);
    expect(hit("alpha")).toEqual([{ id: "p.md#1", heading: "One", slug: "one" }]);
    expect(hit("bravo")).toEqual([{ id: "p.md#2", heading: "Two", slug: "two" }]);
    expect(hit("charlie")).toEqual([{ id: "p.md#3", heading: "Three", slug: "three" }]);
  });

  it("an empty lead section on a page with headings is still emitted; heading ids keep their position (heading 1 is p.md#1)", () => {
    const ms = indexOf({ "p.md": "# First\n\nbody\n\n# Second\n\nmore\n" });
    expect(docIds(ms).sort()).toEqual(["p.md#0", "p.md#1", "p.md#2"]);
    expect(ms.search("body", exact)).toMatchObject([{ id: "p.md#1", heading: "First" }]);
  });

  it("a duplicate heading keeps the parse-time slug (-1 suffix) as the stored slug", () => {
    const ms = indexOf({ "p.md": "# Setup\n\nfirst\n\n# Setup\n\nsecond\n" });
    expect(ms.search("second", exact).map((r) => r.slug)).toEqual(["setup-1"]);
  });

  it("stores path, slug, title and heading, and the title is the frontmatter title", () => {
    const ms = indexOf({ "dir/p.md": "---\ntitle: Real Title\n---\n# H\n\nfindme\n" });
    const [r] = ms.search("findme", exact);
    expect(r).toMatchObject({ path: "dir/p.md", slug: "h", title: "Real Title", heading: "H" });
  });
});

describe("buildSearchIndex: ranking by field (US-089 scenario 2, TR-020)", () => {
  it("boosts are title 3, aliases 3, heading 2, text 1", () => {
    expect(SEARCH_BOOST).toEqual({ title: 3, aliases: 3, heading: 2, text: 1 });
    expect(SEARCH_OPTIONS.searchOptions).toMatchObject({ boost: { title: 3, aliases: 3, heading: 2, text: 1 }, prefix: true, fuzzy: SEARCH_FUZZY });
  });

  it("a title match ranks first, then alias above heading above body", () => {
    const ms = indexOf({
      "body.md": "---\ntitle: Plain\n---\nthe quokka is in the body only\n",
      "heading.md": "---\ntitle: Other\n---\n# Quokka\n\nunrelated words here\n",
      "alias.md": "---\ntitle: Third\naliases: [quokka, spare]\n---\nnothing relevant\n",
      "title.md": "---\ntitle: Quokka\n---\nnothing relevant either\n",
    });
    const results = ms.search("quokka", exact);
    expect(results.map((r) => r.path)).toEqual(["title.md", "alias.md", "heading.md", "body.md"]);
    const score = (p: string) => results.find((r) => r.path === p)!.score;
    expect(score("title.md")).toBeGreaterThan(score("heading.md"));
    expect(score("alias.md")).toBeGreaterThan(score("heading.md"));
    expect(score("heading.md")).toBeGreaterThan(score("body.md"));
  });

  it("a title match ranks above an unrelated body match", () => {
    const ms = indexOf({
      "a.md": "---\ntitle: Onboarding\n---\nsomething else\n",
      "b.md": "---\ntitle: Misc\n---\nwe mention onboarding once in passing\n",
    });
    expect(paths(ms, "onboarding")[0]).toBe("a.md");
  });

  it("prefix matching is on in the exported options", () => {
    const ms = indexOf({ "a.md": "---\ntitle: Onboarding\n---\nx\n" });
    expect(paths(ms, "onboard", { fuzzy: false })).toEqual(["a.md"]);
  });
});

describe("buildSearchIndex: round trip with the exported options (S2)", () => {
  it("build, JSON.parse, loadJSON with SEARCH_OPTIONS, query finds the document", () => {
    const json = buildSearchIndex(pagesOf({ "a.md": "---\ntitle: Roundtrip\n---\n# Section\n\nneedle\n" }));
    expect(() => JSON.parse(json)).not.toThrow();
    const ms = MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS);
    expect(ms.search("needle", exact).map((r) => r.id)).toEqual(["a.md#1"]);
    expect(ms.search("roundtrip", exact).map((r) => r.id).sort()).toEqual(["a.md#0", "a.md#1"]);
  });

  it("loading with different options than the build used does not behave the same (the failure the shared options prevent)", () => {
    const json = buildSearchIndex(pagesOf({ "a.md": "# Section\n\nCAFÉ needle\n" }));
    const mismatched = MiniSearch.loadJSON<SearchDoc>(json, { ...SEARCH_OPTIONS, processTerm: (t) => t.toUpperCase() });
    expect(mismatched.search("café", exact)).toEqual([]);
    expect(load(json).search("café", exact)).toHaveLength(1);
  });
});

describe("buildSearchIndex: empty wiki (S7, US-089 scenario 4)", () => {
  it("an empty Map returns a valid export that loads and answers every query with []", () => {
    const json = buildSearchIndex(new Map());
    expect(() => JSON.parse(json)).not.toThrow();
    const ms = load(json);
    expect(ms.documentCount).toBe(0);
    for (const q of ["", "a", "anything at all", "日本語"]) expect(ms.search(q)).toEqual([]);
  });
});

describe("TC-226: a page with zero headings still contributes one document", () => {
  it("exactly one document, heading empty, text is the body prose", () => {
    const ms = indexOf({ "p.md": "---\ntitle: Flat\n---\nonly body prose pelican here\n" });
    expect(ms.documentCount).toBe(1);
    expect(ms.search("pelican", exact)).toMatchObject([{ id: "p.md#0", heading: "", slug: "" }]);
  });

  it("a hand-built ParsedPage with headings [] and a marker-free rawText is not dropped", () => {
    const page: ParsedPage = { ...pagesOf({ "p.md": "x" }).get("p.md")!, headings: [], rawText: "marker free pelican prose" };
    const ms = load(buildSearchIndex(new Map([["p.md", page]])));
    expect(ms.documentCount).toBe(1);
    expect(paths(ms, "pelican")).toEqual(["p.md"]);
  });

  it("a page with no prose and no headings (frontmatter only) still gives its one lead document, findable by title", () => {
    const ms = indexOf({ "meta.md": "---\ntitle: Metaonly\nstatus: x\n---\n" });
    expect(ms.documentCount).toBe(1);
    expect(paths(ms, "metaonly")).toEqual(["meta.md"]);
  });
});

describe("TC-469: only visible text is indexed", () => {
  const PAGE = [
    "---",
    "title: Visiblepage",
    "aliases: [Visalias]",
    "status: hiddenstatus",
    "owner: hiddenowner",
    "---",
    "text <!-- hiddennote --> more visibleword",
    "",
    "inline <script>inlinescriptword</script> and <style>inlinestyleword</style> tail <b>boldword</b>",
    "",
    "inline <noscript>noscriptword</noscript> and <svg><title>svgword</title></svg> and <template>templateword</template> end",
    "",
    "<!-- blockcomment -->",
    "",
    "<script>blockscriptword</script>",
    "",
    "<style>.a { content: 'blockstyleword' }</style>",
    "",
    "# Heading <!-- headingcomment --> shown",
    "",
    "[[Target|shown label]] and [[PlainTarget]]",
    "",
    "> [!note] Callout title",
    "> calloutword here",
    "",
    "- listword",
    "",
    "| a | b |",
    "| - | - |",
    "| cellword | x |",
    "",
    "```mermaid",
    "graph TD; mermaidnode --> other",
    "```",
    "",
  ].join("\n");
  const ms = indexOf({ "v.md": PAGE, "target.md": "# Target\n\nt\n" });

  it.each(["hiddennote", "inlinescriptword", "inlinestyleword", "noscriptword", "svgword", "templateword", "blockcomment", "blockscriptword", "blockstyleword", "headingcomment", "hiddenstatus", "hiddenowner"])(
    "%s is not found",
    (word) => {
      expect(ms.search(word, { prefix: false, fuzzy: false })).toEqual([]);
    },
  );

  it.each([
    ["visibleword", "text after an HTML comment"],
    ["boldword", "text inside an allowed inline tag"],
    ["shown", "heading text outside the comment"],
    ["label", "wikilink display text"],
    ["plaintarget", "wikilink target shown as written"],
    ["calloutword", "callout body"],
    ["callout", "callout title"],
    ["listword", "list item"],
    ["cellword", "table cell"],
    ["mermaidnode", "Mermaid source"],
    ["visiblepage", "title"],
    ["visalias", "alias"],
  ])("%s is found (%s)", (word) => {
    expect(paths(ms, word)).toContain("v.md");
  });

  it("the comment inside a paragraph leaves the words around it in the same section text", () => {
    expect(paths(ms, "text")).toContain("v.md");
    expect(paths(ms, "more")).toContain("v.md");
  });
});

describe("TC-470: a hostile or oversized page never throws, never drops the index, ids stay unique", () => {
  const big = "bigword " + "lorem ipsum ".repeat(250_000);
  const manyHeadings = Array.from({ length: 5000 }, (_, i) => `## Section ${i}\n\ntext ${i}\n`).join("\n");
  const dupHeadings = Array.from({ length: 200 }, () => "## Same\n\nbody\n").join("\n");
  const FILES: Record<string, string> = {
    "normal.md": "---\ntitle: Normalpage\n---\n# Intro\n\nordinary words\n",
    "big.md": big,
    "many.md": manyHeadings,
    "punct.md": "# !!!\n\none\n\n# 🚀\n\ntwo\n\n# ???\n\nthree\n\nlead after? no\n",
    "mark.md": "# Head\u001eing\n\nbody\u001e text\n\n# \u001e\n\nx\n",
    "dup.md": dupHeadings,
    "fm-only.md": "---\ntitle: Fmonly\n---\n",
    "binary.md": String.fromCharCode(...Array.from({ length: 2000 }, (_, i) => (i * 37) % 256)) + "\u0000\u0001\ufffd# \u0000\n",
  };

  // BUG-018: parsing the 3 MB page plus 5000 headings costs about 2.8 s alone and 5.8-6.1 s under the parallel
  // full suite (the timed build itself is under 0.2 s), past the 5 s default. The fixture size is the point of the
  // test, so it gets its own ceiling (about 2.5x the worst full-suite run) instead of a smaller page.
  const BUG_018_TIMEOUT_MS = 15_000;
  it("builds a valid index, finds the normal page and a word from the large paragraph, with unique document ids", () => {
    const pages = pagesOf(FILES);
    const started = performance.now();
    let json = "";
    expect(() => {
      json = buildSearchIndex(pages);
    }).not.toThrow();
    const elapsedMs = performance.now() - started;
    const ms = load(json);
    expect(paths(ms, "normalpage")).toContain("normal.md");
    expect(paths(ms, "bigword")).toEqual(["big.md"]);
    expect(paths(ms, "fmonly")).toEqual(["fm-only.md"]);
    const ids = docIds(ms);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(ms.documentCount);
    // Proposed bound (NO MEASURE until US-140): a loose ceiling so a regression to quadratic work shows.
    expect(elapsedMs).toBeLessThan(2000);
  }, BUG_018_TIMEOUT_MS);

  it("a multi-line setext heading is indexed whole in the heading field", () => {
    const ms = indexOf({ "s.md": "alpha line\nomega line\n===\n\nbody\n" });
    expect(ms.search("omega", { fields: ["heading"], ...exact }).map((r) => r.id)).toEqual(["s.md#1"]);
    expect(ms.search("omega", { fields: ["text"], ...exact })).toEqual([]);
  });

  it("two punctuation or emoji headings both get their own document (slug-empty headings do not collide with the lead)", () => {
    const ms = indexOf({ "punct.md": FILES["punct.md"]! });
    expect(docIds(ms).sort()).toEqual(["punct.md#0", "punct.md#1", "punct.md#2", "punct.md#3"]);
  });

  it("200 headings of the same text give 201 documents (with the lead) and unique ids", () => {
    const ms = indexOf({ "dup.md": dupHeadings });
    expect(ms.documentCount).toBe(201);
  });

  it("5,000 headings give 5,001 documents (the lead plus one each)", () => {
    expect(indexOf({ "many.md": manyHeadings }).documentCount).toBe(5001);
  });

  it("a U+001E inside a heading or body cannot split a section", () => {
    const ms = indexOf({ "mark.md": FILES["mark.md"]! });
    expect(docIds(ms).sort()).toEqual(["mark.md#0", "mark.md#1", "mark.md#2"]);
    expect(paths(ms, "heading")).toEqual(["mark.md"]);
  });

  it("never throws for a page whose rawText is malformed, and skips only what it cannot index", () => {
    const good = pagesOf({ "ok.md": "# A\n\nfindable\n" }).get("ok.md")!;
    const bad = { ...good, path: "bad.md", rawText: "\u001e\u001e\u001e\n\n\u001e", headings: [] } as ParsedPage;
    const worse = { path: "worse.md" } as unknown as ParsedPage;
    let json = "";
    expect(() => {
      json = buildSearchIndex(new Map([["ok.md", good], ["bad.md", bad], ["worse.md", worse]]));
    }).not.toThrow();
    expect(paths(load(json), "findable")).toEqual(["ok.md"]);
  });
});

describe("TC-471: exact terms fold NFC then toLowerCase like link resolution, with no diacritic folding", () => {
  const ms = indexOf({
    "cafe.md": "---\ntitle: Café\n---\nx\n",
    "strasse.md": "---\ntitle: Straße\n---\nx\n",
    "apfel.md": "---\ntitle: Äpfel\n---\nx\n",
    "decomposed.md": "---\ntitle: Cafe\u0301 decomposed\n---\nx\n",
    "greek.md": "---\ntitle: Ελληνικά\n---\nx\n",
    "ja.md": "---\ntitle: Japanese\n---\n日本語のテキストです。これは文章です\n",
  });

  it("exact match: lower-case, upper-case and decomposed \u00e9 (e + U+0301) all find the composed title Café", () => {
    for (const q of ["caf\u00e9", "CAF\u00c9", "cafe\u0301"]) expect(paths(ms, q)).toContain("cafe.md");
  });

  it("exact match: a decomposed title is found by the composed query (NFC at index time)", () => {
    expect(paths(ms, "café")).toContain("decomposed.md");
  });

  it("exact match: strasse does not find Straße, and ß finds it only as its own lower-cased letter (no full case folding)", () => {
    expect(paths(ms, "strasse")).not.toContain("strasse.md");
    expect(paths(ms, "straße")).toEqual(["strasse.md"]);
    expect(paths(ms, "STRASSE")).not.toContain("strasse.md");
  });

  it("exact match: cafe does not find café (no diacritic folding), and Äpfel is found as äpfel but not apfel", () => {
    expect(paths(ms, "cafe")).toEqual([]);
    expect(paths(ms, "äpfel")).toEqual(["apfel.md"]);
    expect(paths(ms, "apfel")).toEqual([]);
  });

  it("shipped options, operator ruling 2026-10-01 (fuzzy wins): cafe finds Café as a near match, strasse still does not find Straße", () => {
    // Pins SEARCH_FUZZY. Retuning it changes this on purpose, with a new ruling.
    expect(SEARCH_FUZZY).toBe(0.2);
    expect(ms.search("cafe").map((r) => r.path)).toContain("cafe.md");
    expect(ms.search("strasse").map((r) => r.path)).not.toContain("strasse.md");
  });

  it("exact match: a Greek title is found case-insensitively", () => {
    expect(paths(ms, "ΕΛΛΗΝΙΚΆ")).toEqual(["greek.md"]);
    expect(paths(ms, "ελληνικά")).toEqual(["greek.md"]);
  });

  it("a CJK query does not throw, with default (prefix and fuzzy) options too", () => {
    expect(() => ms.search("日本語")).not.toThrow();
    expect(() => ms.search("日本語", exact)).not.toThrow();
  });

  it("a CJK query matching the leading characters of an unsegmented run finds it (the default tokenizer does not split CJK)", () => {
    expect(paths(ms, "日本語", { fuzzy: false })).toEqual(["ja.md"]);
  });
});
