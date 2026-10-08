import type { Root } from "hast";
import { describe, expect, it } from "vitest";
import { CALLOUT_CLASS_TOKENS } from "./callouts";
import { RESERVED_CLASS_TOKENS, RESERVED_PROPERTIES, RESERVED_PROPERTY_PREFIXES, rehypeStripAuthorAttrs } from "./strip-author-attrs";

describe("rehypeStripAuthorAttrs", () => {
  it("removes data-mermaid-* from every element and leaves other properties alone", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { dataMermaidId: "x", dataMermaidSource: "s", dataOther: "keep", title: "t" },
          children: [{ type: "element", tagName: "span", properties: { dataMermaidId: "y" }, children: [] }],
        },
      ],
    };
    rehypeStripAuthorAttrs()(tree);
    const div = tree.children[0] as import("hast").Element;
    expect(div.properties).toEqual({ dataOther: "keep", title: "t" });
    expect((div.children[0] as import("hast").Element).properties).toEqual({});
  });
  it("ships the data-mermaid prefix, style, tabIndex, role and ariaHidden, and the Shiki, callout and wikilink class tokens (one extendable list)", () => {
    expect(RESERVED_PROPERTY_PREFIXES).toEqual(["dataMermaid"]);
    expect(RESERVED_PROPERTIES).toEqual(["style", "tabIndex", "role", "ariaHidden", "target", "rel"]);
    expect(RESERVED_CLASS_TOKENS).toEqual(["shiki", "css-variables", "line", ...CALLOUT_CLASS_TOKENS, "wikilink", "wikilink-unavailable", "wikilink-unavailable-indicator", "wikilink-unavailable-text", "note-embed", "embed-marker", "external-link", "external-link-icon", "external-link-text", "heading-anchor"]);
    expect(CALLOUT_CLASS_TOKENS).toEqual([
      "callout", "callout-note", "callout-info", "callout-tip", "callout-warning", "callout-danger", "callout-success",
      "callout-important", "callout-default", "callout-title", "callout-icon",
    ]);
  });
  it("K8: removes style and tabIndex from every element and only the reserved class tokens from a class list", () => {
    const el = (tagName: string, properties: import("hast").Properties): import("hast").Element => ({
      type: "element",
      tagName,
      properties,
      children: [],
    });
    const span = el("span", { style: "color:red", className: ["line", "keep"] });
    const pre = el("pre", { className: ["shiki", "css-variables"], tabIndex: 0, style: "--shiki-token-keyword:red" });
    const oldTheme = el("pre", { className: ["shiki-themes", "github-dark", "keep"] });
    const goodSpan = el("span", { style: "color:var(--shiki-token-keyword)" });
    const code = el("code", { className: ["language-ts"] });
    const tree: Root = { type: "root", children: [span, pre, code, oldTheme, goodSpan] };
    rehypeStripAuthorAttrs()(tree);
    expect(span.properties).toEqual({ className: ["keep"] });
    expect(pre.properties).toEqual({});
    expect(code.properties).toEqual({ className: ["language-ts"] });
    // The old theme classes are no longer reserved (the sanitiser's pre list no longer admits them either), and an author
    // style in the exact form the schema would admit still dies here: the schema alone cannot tell it from Shiki's.
    expect(oldTheme.properties).toEqual({ className: ["shiki-themes", "github-dark", "keep"] });
    expect(goodSpan.properties).toEqual({});
  });
  it("US-189 fix round 2: removes an author ariaLabelledBy from input only", () => {
    const input: import("hast").Element = { type: "element", tagName: "input", properties: { type: "checkbox", disabled: true, ariaLabelledBy: ["x"] }, children: [] };
    const span: import("hast").Element = { type: "element", tagName: "span", properties: { ariaLabelledBy: ["x"] }, children: [] };
    rehypeStripAuthorAttrs()({ type: "root", children: [input, span] });
    expect(input.properties).toEqual({ type: "checkbox", disabled: true });
    expect(span.properties).toEqual({ ariaLabelledBy: ["x"] });
  });
});
