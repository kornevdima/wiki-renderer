import { describe, expect, it } from "vitest";

import type { ParsedPage } from "@/content/render/types";
import { buildTree } from "@/content/runtime/tree";

import { buildPageCrumbs, folderLandingPath } from "./page-crumbs";

const tree = (paths: string[]) => buildTree(new Map(paths.map((path) => [path, { title: path } as ParsedPage])));

describe("buildPageCrumbs (US-188, FR-052)", () => {
  const t = tree(["a/_index.md", "a/b/page.md", "a/b/c/deep.md", "a/b/c/_index.md", "root.md"]);

  it("a root page has the title as its only crumb", () => {
    expect(buildPageCrumbs("w1", "root.md", "Root", t)).toEqual([{ label: "Root" }]);
  });

  it("links a folder that holds _index.md and leaves one that does not as plain text", () => {
    expect(buildPageCrumbs("w1", "a/b/page.md", "The page", t)).toEqual([
      { label: "a", href: "/w/w1/a/_index.md" },
      { label: "b" },
      { label: "The page" },
    ]);
  });

  it("decides each level on its own", () => {
    expect(buildPageCrumbs("w1", "a/b/c/deep.md", "Deep", t)).toEqual([
      { label: "a", href: "/w/w1/a/_index.md" },
      { label: "b" },
      { label: "c", href: "/w/w1/a/b/c/_index.md" },
      { label: "Deep" },
    ]);
  });

  it("a tree without _index.md yields no links at all", () => {
    const without = tree(["a/b/page.md"]);
    expect(buildPageCrumbs("w1", "a/b/page.md", "P", without).map((c) => c.href)).toEqual([undefined, undefined, undefined]);
  });

  it("matches the exact file name only, and only as a direct child", () => {
    expect(folderLandingPath(tree(["a/index.md", "a/README.md", "a/_Index.md"]), "a")).toBeNull();
    expect(folderLandingPath(tree(["a/b/_index.md", "a/x.md"]), "a")).toBeNull();
  });

  it("encodes segments, takes the title verbatim and leaves a folder the tree lacks as text", () => {
    const odd = tree(["my docs/_index.md", "my docs/p.md"]);
    expect(buildPageCrumbs("w 1", "my docs/p.md", "<b>T</b>", odd)).toEqual([
      { label: "my docs", href: "/w/w%201/my%20docs/_index.md" },
      { label: "<b>T</b>" },
    ]);
    expect(buildPageCrumbs("w1", "gone/p.md", "P", odd)).toEqual([{ label: "gone" }, { label: "P" }]);
  });

  it("the folder's own _index.md page links to itself", () => {
    expect(buildPageCrumbs("w1", "a/_index.md", "A home", t)).toEqual([{ label: "a", href: "/w/w1/a/_index.md" }, { label: "A home" }]);
  });

  it("a root _index.md page is a single crumb (no folder to link)", () => {
    const r = tree(["_index.md", "a/p.md"]);
    expect(buildPageCrumbs("w1", "_index.md", "Home", r)).toEqual([{ label: "Home" }]);
  });

  it("encodes # ? and % in folder names in the crumb href", () => {
    const odd = tree(["c#sharp/_index.md", "c#sharp/q?/_index.md", "c#sharp/q?/100%/_index.md", "c#sharp/q?/100%/p.md"]);
    expect(buildPageCrumbs("w1", "c#sharp/q?/100%/p.md", "P", odd)).toEqual([
      { label: "c#sharp", href: "/w/w1/c%23sharp/_index.md" },
      { label: "q?", href: "/w/w1/c%23sharp/q%3F/_index.md" },
      { label: "100%", href: "/w/w1/c%23sharp/q%3F/100%25/_index.md" },
      { label: "P" },
    ]);
  });
});
