import type { Root } from "mdast";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./pipeline";
import { MAX_INNER, splitWikilinks, wikilinkLabel } from "./wikilink-syntax";

function links(text: string) {
  return (splitWikilinks(text) ?? []).filter((n) => n.type === "wikilink");
}

describe("splitWikilinks", () => {
  it("recognises bare, piped, heading and heading+piped forms", () => {
    expect(links("[[A]]")).toMatchObject([{ target: "A", embed: false, value: "A" }]);
    expect(links("[[A|shown]]")).toMatchObject([{ target: "A", display: "shown", value: "shown" }]);
    expect(links("[[A#H]]")).toMatchObject([{ target: "A", heading: "H", value: "A > H" }]);
    expect(links("[[A#H|shown]]")).toMatchObject([{ target: "A", heading: "H", display: "shown", value: "shown" }]);
  });
  it("trims the target and recognises a leading ! as an embed carrying its source", () => {
    expect(links("![[ A ]]")).toMatchObject([{ target: "A", embed: true, raw: "![[ A ]]" }]);
  });
  it("keeps the surrounding text and several links in order", () => {
    const parts = splitWikilinks("x [[A]] y [[B]] z") ?? [];
    expect(parts.map((p) => p.type)).toEqual(["text", "wikilink", "text", "wikilink", "text"]);
  });
  it.each(["[[", "[[]]", "[[ ]]", "[[#]]", "[[ # ]]", "[[|x]]", "[[a]]]", "[[a[b]c]]", "[[[a]]]", "[[a\nb]]", "[[a", "a]]", "[a]"])(
    "leaves %j literal",
    (input) => {
      expect(splitWikilinks(input)).toBeUndefined();
    },
  );
  it("recognises the same-page form [[#H]] with an empty target (US-077)", () => {
    expect(links("[[#H]]")).toMatchObject([{ target: "", heading: "H", value: "H", embed: false }]);
    expect(links("[[#H|shown]]")).toMatchObject([{ target: "", heading: "H", display: "shown", value: "shown" }]);
  });
  it("drops an empty display and heading part", () => {
    expect(links("[[A|]]")).toMatchObject([{ target: "A", value: "A" }]);
    expect(links("[[A#]]")).toMatchObject([{ target: "A", value: "A" }]);
  });
  it("stays literal over MAX_INNER characters", () => {
    expect(splitWikilinks(`[[${"a".repeat(MAX_INNER + 1)}]]`)).toBeUndefined();
    expect(links(`[[${"a".repeat(MAX_INNER)}]]`)).toHaveLength(1);
  });
  it("is linear on a hostile run of openers", () => {
    const start = performance.now();
    expect(splitWikilinks("[[".repeat(200_000) + "]]")).toBeUndefined();
    expect(splitWikilinks("[[a".repeat(200_000))).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("wikilinkLabel", () => {
  it("shows the display text, else the target, with the heading as `Target > Heading`", () => {
    expect(wikilinkLabel("A", undefined, "d")).toBe("d");
    expect(wikilinkLabel("A", "H", undefined)).toBe("A > H");
    expect(wikilinkLabel("A", undefined, undefined)).toBe("A");
  });
});

describe("recogniseWikilinks (in parseMarkdown)", () => {
  const kinds = (tree: Root, type: string): number => JSON.stringify(tree).split(`"type":"${type}"`).length - 1;
  it("makes wikilink nodes for text, none inside code, html or links", () => {
    const tree = parseMarkdown(
      ["[[A]]", "", "`[[B]]`", "", "```", "[[C]]", "```", "", "    [[D]]", "", "<!-- [[E]] -->", "", "[[[F]]](x.md)"].join("\n"),
    );
    expect(kinds(tree, "wikilink")).toBe(1);
  });
  it("does not mark the front matter", () => {
    const tree = parseMarkdown("---\nk: '[[G]]'\n---\nbody");
    expect(kinds(tree, "wikilink")).toBe(0);
  });
});
