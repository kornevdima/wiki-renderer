import { describe, expect, it } from "vitest";

import { folderSegments } from "./search-result-path";

describe("folderSegments (US-222, TC-518)", () => {
  it("a page at the wiki root has no folders", () => {
    expect(folderSegments("Readme.md")).toEqual([]);
  });
  it("nested pages give the folders in order and never the file name", () => {
    expect(folderSegments("a/Readme.md")).toEqual(["a"]);
    expect(folderSegments("deliverables/architecture/ADR-008 Server-side Markdown pipeline.md")).toEqual(["deliverables", "architecture"]);
  });
  it("a 30-level path keeps every level, in order", () => {
    const folders = Array.from({ length: 30 }, (_, i) => `f${i}`);
    expect(folderSegments(`${folders.join("/")}/x.md`)).toEqual(folders);
  });
  it("a 100-character folder name is returned whole (the view truncates it)", () => {
    const long = "x".repeat(100);
    expect(folderSegments(`${long}/x.md`)).toEqual([long]);
  });
  it("odd names stay as written: the separator character, spaces, non-ASCII, markup without a slash (a slash would split it, as in any git path), a dot folder", () => {
    for (const name of ["A › B", "with space", "Ünïcode", "<i onclick=x>", ".hidden"]) {
      expect(folderSegments(`${name}/x.md`)).toEqual([name]);
    }
  });
  it("a trailing slash, a doubled slash, a path with no extension and an empty path all give a defined result", () => {
    expect(folderSegments("a/b/")).toEqual(["a", "b"]);
    expect(folderSegments("a//b/x.md")).toEqual(["a", "b"]);
    expect(folderSegments("a/b/Readme")).toEqual(["a", "b"]);
    expect(folderSegments("")).toEqual([]);
    expect(folderSegments("/")).toEqual([]);
  });
});
