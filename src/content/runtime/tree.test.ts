/**
 * Unit specs for `buildTree` (US-061; contract S9-S13 tree half, dispatcher ruling Y4).
 */
import { describe, expect, it } from "vitest";
import type { ParsedPage } from "@/content/render/types";
import { buildTree } from "./tree";
import type { FileEntry, NavNode } from "./types";

function fixture(paths: string[]): { files: Map<string, FileEntry>; pages: Map<string, ParsedPage> } {
  const files = new Map<string, FileEntry>();
  const pages = new Map<string, ParsedPage>();
  for (const path of paths) {
    files.set(path, { bytes: new Uint8Array(), contentType: "x" });
    if (path.endsWith(".md")) {
      const stem = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
      pages.set(path, { path, title: `T:${stem}` } as ParsedPage);
    }
  }
  return { files, pages };
}

function tree(paths: string[]): NavNode[] {
  const { pages } = fixture(paths);
  return buildTree(pages);
}

/** Compact outline: `folder(children)` / `page` by name. */
function outline(nodes: NavNode[]): unknown[] {
  return nodes.map((n) => (n.kind === "folder" ? { [n.name]: outline(n.children) } : n.name));
}

describe("buildTree contents (S9, S10)", () => {
  it("S9: mirrors the folder nesting; images-only folders and non-Markdown files are not nodes", () => {
    const result = tree([
      "index.md",
      "a/one.md",
      "a/b/two.md",
      "a/b/c/three.md",
      "z.md",
      "img/x.png",
      "a/b/diagram.png",
    ]);
    expect(outline(result)).toEqual([{ a: [{ b: [{ c: ["three"] }, "two"] }, "one"] }, "index", "z"]);
  });

  it("S9: folder and page nodes carry exact repo paths and titles", () => {
    const result = tree(["a/b/two.md"]);
    const a = result[0] as Extract<NavNode, { kind: "folder" }>;
    expect(a).toMatchObject({ kind: "folder", name: "a", path: "a" });
    const b = a.children[0] as Extract<NavNode, { kind: "folder" }>;
    expect(b).toMatchObject({ name: "b", path: "a/b" });
    expect(b.children[0]).toEqual({ kind: "page", name: "two", path: "a/b/two.md", title: "T:two" });
  });

  it("S10: nothing is filtered by name (meta/, .github/, _private/)", () => {
    const result = tree(["meta/notes.md", ".github/README.md", "_private/x.md"]);
    expect(outline(result)).toEqual([{ _private: ["x"] }, { ".github": ["README"] }, { meta: ["notes"] }]);
  });

  it("an empty wiki gives an empty tree", () => {
    expect(tree(["img/x.png"])).toEqual([]);
  });
});

describe("buildTree order (S11)", () => {
  it("folders first, then pages; natural, case-insensitive order within each group", () => {
    const result = tree(["Item 10.md", "item 2.md", "Item 1.md", "apple.md", "Banana.md", "Zeta/p.md", "alpha.md"]);
    expect(outline(result)).toEqual([
      { Zeta: ["p"] },
      "alpha",
      "apple",
      "Banana",
      "Item 1",
      "item 2",
      "Item 10",
    ]);
  });

  it("a case-only pair orders deterministically by code-unit comparison, whatever the input order", () => {
    expect(outline(tree(["Readme.md", "README.md"]))).toEqual(["README", "Readme"]);
    expect(outline(tree(["README.md", "Readme.md"]))).toEqual(["README", "Readme"]);
  });
});

describe("buildTree purity and immutability (S12, S13)", () => {
  it("S12: the same inputs give an equal tree (pure function of pages)", () => {
    const { pages } = fixture(["a/b.md", "c.md"]);
    expect(buildTree(pages)).toEqual(buildTree(pages));
  });

  it("S13: the tree, every folder and every page node are frozen; a write throws", () => {
    const result = tree(["a/b.md", "c.md"]);
    const folder = result[0] as Extract<NavNode, { kind: "folder" }>;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(folder)).toBe(true);
    expect(Object.isFrozen(folder.children)).toBe(true);
    expect(Object.isFrozen(folder.children[0])).toBe(true);
    expect(Object.isFrozen(result[1])).toBe(true);
    expect(() => {
      (folder as { name: string }).name = "x";
    }).toThrow(TypeError);
    expect(() => {
      folder.children.push(result[1]!);
    }).toThrow(TypeError);
  });
});
