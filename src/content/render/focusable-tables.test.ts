import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeFocusableTables } from "./focusable-tables";
import { rehypeStripAuthorAttrs } from "./strip-author-attrs";

const el = (tagName: string, properties: import("hast").Properties = {}, children: Element["children"] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

describe("rehypeFocusableTables (US-189, TC-503)", () => {
  it("sets tabIndex 0 on every table, including one nested in another element, and nothing else", () => {
    const inner = el("table", { className: ["x"] });
    const outer = el("table");
    const td = el("td");
    const div = el("div", {}, [inner]);
    const tree: Root = { type: "root", children: [outer, div, el("p"), td] };
    rehypeFocusableTables()(tree);
    expect(outer.properties).toEqual({ tabIndex: 0 });
    expect(inner.properties).toEqual({ className: ["x"], tabIndex: 0 });
    expect(div.properties).toEqual({});
    expect(td.properties).toEqual({});
  });

  it("replaces whatever tabIndex a table carried with 0 (the strip step removes author values before this step)", () => {
    const table = el("table", { tabIndex: 5 });
    rehypeFocusableTables()({ type: "root", children: [table] });
    expect(table.properties.tabIndex).toBe(0);
  });

  it("after the strip step, an author's tabIndex on any other element is still gone", () => {
    const table = el("table", { tabIndex: 3 });
    const cell = el("td", { tabIndex: 0 });
    const section = el("section", { tabIndex: 0 });
    const tree: Root = { type: "root", children: [table, cell, section] };
    rehypeStripAuthorAttrs()(tree);
    rehypeFocusableTables()(tree);
    expect(table.properties).toEqual({ tabIndex: 0 });
    expect(cell.properties).toEqual({});
    expect(section.properties).toEqual({});
  });
});

describe("rehypeFocusableTables: pre (US-189 fix round 1)", () => {
  it("sets tabIndex 0 on every pre, and an author's pre tabIndex is stripped first", () => {
    const pre = el("pre", { tabIndex: 4 });
    const other = el("code", { tabIndex: 0 });
    const tree: Root = { type: "root", children: [pre, other] };
    rehypeStripAuthorAttrs()(tree);
    expect(pre.properties).toEqual({});
    rehypeFocusableTables()(tree);
    expect(pre.properties).toEqual({ tabIndex: 0 });
    expect(other.properties).toEqual({});
  });
});
