/**
 * Component specs for `./all-properties` (US-108 contract P1-P5, W8-1..W8-3, retargeted by US-220: the Properties panel became the closed All properties disclosure in the page rail). `renderToStaticMarkup` with the
 * REAL `messages/en.json`, so the accepted copy (R-7) is checked verbatim. The data comes from the real
 * `buildFrontmatterView`, so the panel is proven against exactly what the render pipeline hands it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { buildFrontmatterView } from "../../content/render/frontmatter-view";
import { AllProperties } from "./all-properties";
import { PageShell } from "./page-shell";

function html(element: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: element }));
}
const rawPanel = (fm: Record<string, unknown>) => html(createElement(AllProperties, { fields: buildFrontmatterView(fm) }));
/** The structure only (US-188 gave the markup its look): no `class` attributes. */
const bare = (markup: string) => markup.replace(/ class="[^"]*"/g, "");
const panel = (fm: Record<string, unknown>) => bare(rawPanel(fm));
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("P1 (US-108 S1): five pairs in source order, nested lists, empty, truncated", () => {
  const out = panel({
    title: "T",
    tags: ["a", "b"],
    owner: { name: "X", team: "Y" },
    empty: null,
    long: "z".repeat(2500),
  });

  it("is a closed details titled All properties and holds five dt/dd pairs in source order", () => {
    expect(out).toContain('<details data-testid="frontmatter-panel"><summary>All properties<span>5</span></summary>');
    expect(out).not.toMatch(/<details[^>]*\bopen\b/);
    expect(out.match(/<dt>/g)).toHaveLength(5);
    expect(out.match(/<dd>/g)).toHaveLength(5);
    const keys = [...out.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
    expect(keys).toEqual(["title", "tags", "owner", "empty", "long"]);
  });

  it("tags and owner are nested lists; empty shows 'empty'; long ends with (truncated)", () => {
    expect(out).toContain("<dt>tags</dt><dd><ul><li>a</li><li>b</li></ul></dd>");
    expect(out).toContain("<dt>owner</dt><dd><ul><li><span>name</span>: <span>X</span></li><li><span>team</span>: <span>Y</span></li></ul></dd>");
    expect(out).toContain("<dt>empty</dt><dd><span>empty</span></dd>");
    expect(out).toMatch(/<dt>long<\/dt><dd><span>z+ \(truncated\)<\/span><\/dd>/);
  });

  it("a two-field example, verbatim", () => {
    expect(panel({ title: "T", tags: ["a"] })).toBe(
      '<details data-testid="frontmatter-panel"><summary>All properties<span>2</span></summary><dl><div><dt>title</dt><dd><span>T</span></dd></div><div><dt>tags</dt><dd><ul><li>a</li></ul></dd></div></dl></details>',
    );
  });

  it("empty strings and empty containers also read 'empty' and still count", () => {
    const o = panel({ s: "", l: [], m: {} });
    expect(o.match(/<span>empty<\/span>/g)).toHaveLength(3);
    expect(o).toContain("<span>3</span></summary>");
  });

  it("a cut key list ends in a (truncated) mark, not a row, and the count is the rows listed (TC-515)", () => {
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, i]));
    const o = panel(many);
    expect(o.match(/<dt>/g)).toHaveLength(100);
    expect(o).not.toContain("<dt>(truncated)</dt>");
    expect(o).toContain("<span>100</span></summary>");
    expect(o).toMatch(/<\/dl><p>\(truncated\)<\/p><\/details>$/);
  });
});

describe("US-188: the Properties look", () => {
  const raw = rawPanel({ title: "T", tags: ["adr", "<b>x</b>"], owner: { team: { name: "Y" } }, list: ["a", ["b"]] });

  it("is the .wr-properties details with no Properties eyebrow, no heading and no tabindex", () => {
    expect(raw).toMatch(/^<details data-testid="frontmatter-panel" class="wr-properties [^"]*">/);
    expect(raw).not.toMatch(/>Properties</);
    expect(raw).not.toMatch(/<h[1-6]|tabindex/i);
  });

  it("shows tags as chips, with hostile text escaped, and leaves other lists as lists", () => {
    const tags = /<dt[^>]*>tags<\/dt><dd[^>]*><ul class="[^"]*flex[^"]*">(.*?)<\/ul>/.exec(raw)![1]!;
    expect(tags.match(/<li\b/g)).toHaveLength(2);
    expect(tags).toContain(">adr</li>");
    expect(tags).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(raw).not.toContain("<b>x</b>");
    expect(bare(raw)).toContain("<dt>list</dt><dd><ul><li><span>a</span></li><li><ul>");
  });

  it("indents a nested list behind a hairline and not the first level", () => {
    expect(raw).toMatch(/<dt[^>]*>owner<\/dt><dd[^>]*><ul class="(?![^"]*border-l)[^"]*"><li><span class="wr-literal">team<\/span>: <ul class="[^"]*border-l[^"]*pl-3/);
  });

  it("an empty tags list reads 'empty', not an empty chip row", () => {
    expect(panel({ tags: [] })).toContain("<dt>tags</dt><dd><span>empty</span></dd>");
  });

  it("uses tokens only: no colour literal or default-palette class", () => {
    expect(raw).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc)-\d/i);
  });
});

describe("P2 (US-220 E3-D5): the page rail is the one complementary landmark, outside main; All properties is not a landmark", () => {
  it("is a details with no tabindex or heading; the shell puts it in an aside named Page details after </main>", () => {
    const out = panel({ a: 1 });
    expect(out).not.toMatch(/tabindex|<h[1-6]|<aside/i);
    const shell = html(
      createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, frontmatter: buildFrontmatterView({ a: 1 }), children: createElement("p", null, "b") }),
    );
    expect(shell.match(/<aside\b/g)).toHaveLength(1);
    expect(shell).toMatch(/<aside aria-label="Page details" data-testid="reader-rail" class="wr-rail">/);
    expect(shell.indexOf("</main>")).toBeLessThan(shell.indexOf("<aside"));
    expect(shell.indexOf("<aside")).toBeLessThan(shell.indexOf('data-testid="frontmatter-panel"'));
    expect(shell).not.toMatch(/reader-properties-column|aria-label="Properties"/);
  });
});

describe("P3 (US-108 S3): no fields, no panel, no empty landmark", () => {
  it("an empty field list renders nothing", () => {
    expect(html(createElement(AllProperties, { fields: [] }))).toBe("");
  });
  it("PageShell with no or empty frontmatter has no aside and no properties column", () => {
    for (const frontmatter of [undefined, []]) {
      const shell = html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, frontmatter, children: null }));
      expect(shell).not.toMatch(/<aside|properties|reader-rail|reader-properties-column/i);
    }
  });
});

describe("P4 (TC-463): hostile keys and values are inert text", () => {
  const hostile = {
    "<img src=x onerror=alert(1)>": "<img src=x onerror=alert(1)>",
    link: "javascript:alert(1)",
    ["k".repeat(10_000)]: "v",
    nested: { "<script>x</script>": ["<b>"] },
  };
  const out = panel(hostile);

  it("no element is created from them and no attribute is injected", () => {
    expect(out).not.toMatch(/<img|<script|<b>/);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("<span>javascript:alert(1)</span>");
    expect(out).not.toMatch(/href=|<[^>]*onerror=/);
  });

  it("the 10,000-character key is cut by the view (2,000 + marker), never rendered whole", () => {
    expect(out).not.toContain("k".repeat(2001));
    expect(out).toMatch(/k{2000} \(truncated\)<\/dt>/);
  });

  it("__proto__ as a key is data, rendered as a pair", () => {
    const o = panel(JSON.parse('{"__proto__":"polluted","a":1}') as Record<string, unknown>);
    expect(o).toContain("<dt>__proto__</dt><dd><span>polluted</span></dd>");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("a nested __proto__ key, as the view produces it, is inert text and pollutes nothing", () => {
    const nested = JSON.parse('{"owner":{"__proto__":{"polluted":"yes"},"name":"X"}}') as Record<string, unknown>;
    const fields = buildFrontmatterView(nested);
    const owner = fields[0]?.value as Record<string, unknown>;
    expect(Object.keys(owner), "PRECONDITION MISSING: the view kept __proto__ as an own key").toContain("__proto__");
    const o = bare(html(createElement(AllProperties, { fields })));
    expect(o).toContain("<li><span>__proto__</span>: <ul><li><span>polluted</span>: <span>yes</span></li></ul></li>");
    expect(o).toContain("<li><span>name</span>: <span>X</span></li>");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("the source never uses raw-HTML injection or an id (W8-1, W8-3)", () => {
    const src = read("./all-properties.tsx");
    expect(src).not.toMatch(/dangerouslySetInnerHTML|\bid=|useId|tabIndex/);
  });
});

describe("P5 (W8-3): ids stay unique and outside the reserved prefixes", () => {
  it("a page with a panel, headings and a repeated embed has unique ids, none from the panel", () => {
    const body = createElement(
      "div",
      null,
      createElement("h2", { id: "user-content-intro" }, "Intro"),
      createElement("div", { id: "embed-1-user-content-intro" }),
      createElement("div", { id: "embed-2-user-content-intro" }),
    );
    const out = html(
      createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, frontmatter: buildFrontmatterView({ a: 1, b: [1] }), children: body }),
    );
    const ids = [...out.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(panel({ a: 1, b: [1] })).not.toMatch(/\sid=/);
  });
});
