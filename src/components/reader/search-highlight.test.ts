import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";

import { SEARCH_OPTIONS } from "@/content/search/doc";
import { querySearchIndex } from "@/content/search/client";
import type { SearchDoc } from "@/content/search/types";

import { highlightSegments, SEARCH_SEPARATOR } from "./search-highlight";

const joined = (text: string, terms: string[]) => highlightSegments(text, terms).map((s) => s.text).join("");
const marked = (text: string, terms: string[]) => highlightSegments(text, terms).filter((s) => s.match).map((s) => s.text);

describe("highlightSegments (US-222, TC-517)", () => {
  it("marks the matched tokens and leaves the rest and the separators unmarked", () => {
    expect(highlightSegments("Markdown pipeline overview", ["markdown", "pipeline"])).toEqual([
      { text: "Markdown", match: true },
      { text: " ", match: false },
      { text: "pipeline", match: true },
      { text: " overview", match: false },
    ]);
  });
  it("matches case-insensitively through the index's own fold, repeated words each once", () => {
    expect(marked("Pipeline pipeline PIPELINE", ["pipeline"])).toEqual(["Pipeline", "pipeline", "PIPELINE"]);
  });
  it("a prefix match marks the whole token: the term is the full indexed word", () => {
    expect(marked("arch architecture archive", ["architecture", "archive"])).toEqual(["architecture", "archive"]);
  });
  it("folds NFC and case but not diacritics (OA-3)", () => {
    expect(marked("Café cafe Café", ["café"])).toEqual(["Café", "Café"]);
    expect(marked("Café", ["café"])).toEqual(["Café"]);
  });
  it("no terms, or no text, gives no marks and no error", () => {
    expect(highlightSegments("Plain title", [])).toEqual([{ text: "Plain title", match: false }]);
    expect(highlightSegments("", ["x"])).toEqual([]);
  });
  it("never nests or overlaps: segments are flat and adjacent unmarked runs are merged", () => {
    const segments = highlightSegments("a, b; c", ["b"]);
    expect(segments).toEqual([{ text: "a, ", match: false }, { text: "b", match: true }, { text: "; c", match: false }]);
  });

  it("joining the segments gives the text back for hostile and regex-like titles and queries' terms", () => {
    const texts = ["C++ (draft) [v2] $1.50 a*b", "<b>Bold</b> & <script>x</script>", ".*", "\\", "&amp; &lt;", "😀 emoji 😀", "  leading and trailing  ", "a\nb\r\nc"];
    const terms = ["c++", "(draft", "[v2]", "$1.50", "a*b", ".*", "\\", "<b>", "&amp;", "script", "b", "bold", "x", "amp", "emoji", "a", "c"];
    for (const text of texts) {
      expect(joined(text, terms)).toBe(text);
      expect(joined(text, [])).toBe(text);
    }
  });
  it("markup characters are only ever segment text; '<' and '>' are symbols, not separators, so MiniSearch indexes '<b>bold<' as one token", () => {
    const text = "<b>Bold</b> & <script>x</script>";
    const segments = highlightSegments(text, ["<b>bold<", "script>"]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(marked(text, ["<b>bold<", "script>"])).toEqual(["<b>Bold<", "script>"]);
    expect(marked(text, ["script", "bold", "b"])).toEqual([]);
  });
  it("a body-only term marks nothing in the title", () => {
    expect(marked("Alpha", ["zebra"])).toEqual([]);
  });
  it("is linear: a very long text of one repeated separator and token finishes quickly", () => {
    const text = "word ".repeat(50_000);
    const started = Date.now();
    expect(joined(text, ["word"])).toBe(text);
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 10_000);
});

describe("the splitter agrees with MiniSearch's default tokenizer (SEARCH_OPTIONS sets none)", () => {
  it("SEARCH_OPTIONS has no custom tokenize", () => {
    expect(SEARCH_OPTIONS.tokenize).toBeUndefined();
    expect(SEARCH_OPTIONS.searchOptions?.tokenize).toBeUndefined();
  });
  it("the separator class is MiniSearch's 7.2.0 default, and each non-empty token is exactly what the index stores", () => {
    const text = "C++ (draft) [v2] $1.50 a*b — it's e-mail, <b>Bold</b> & x_y. 日本語 テスト\nnext";
    const probe = new MiniSearch<{ id: string; text: string }>({ fields: ["text"], processTerm: (t) => t.toLowerCase() });
    probe.add({ id: "1", text });
    const indexed = [...(probe as unknown as { _index: Map<string, unknown> })._index.keys()].sort();
    const mine = [...new Set(text.split(new RegExp(SEARCH_SEPARATOR.source, "u")).filter((t) => t !== "").map((t) => t.toLowerCase()))].sort();
    expect(mine).toEqual(indexed);
  });
  it("end to end: the words a query matches in a title are marked, and nothing else", () => {
    const docs: SearchDoc[] = [
      { id: "a.md#0", path: "deliverables/architecture/a.md", heading: "", slug: "", title: "ADR-008 Server-side Markdown pipeline", aliases: [], text: "" },
    ];
    const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
    index.addAll(docs);
    const [row] = querySearchIndex(index, "markdown pipeline");
    expect(marked(row!.title, row!.terms)).toEqual(["Markdown", "pipeline"]);
    const [prefix] = querySearchIndex(index, "mark");
    expect(marked(prefix!.title, prefix!.terms)).toEqual(["Markdown"]);
  });
});
