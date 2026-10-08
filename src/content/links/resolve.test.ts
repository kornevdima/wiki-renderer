import { describe, expect, it } from "vitest";
import { parsePages } from "@/content/render/parse";
import type { FileEntry } from "@/content/runtime/types";
import { buildLinkMap } from "./link-map";
import { resolveLink } from "./resolve";

const enc = new TextEncoder();
function mapOf(paths: string[]) {
  const files = new Map<string, FileEntry>(paths.map((p) => [p, { bytes: enc.encode(`# ${p}`), contentType: "x" }]));
  return buildLinkMap(parsePages(files), files, "w", "s");
}
const link = (text: string, extra: { heading?: string; display?: string } = {}) => ({ kind: "wikilink" as const, text, ...extra });

describe("resolveLink: bare links (L1, L2, L3)", () => {
  const map = mapOf(["notes/Other Note.md", "a/Dup.md", "b/Dup.md"]);
  it("resolves a bare link to its page", () => {
    expect(resolveLink(map, link("Other Note"))).toEqual({ kind: "page", path: "notes/Other Note.md" });
  });
  it("folds case (TR-017)", () => {
    expect(resolveLink(map, link("other note"))).toEqual({ kind: "page", path: "notes/Other Note.md" });
    expect(resolveLink(map, link("OTHER NOTE"))).toEqual({ kind: "page", path: "notes/Other Note.md" });
  });
  it("treats a trailing .md as the same note, in any case", () => {
    const expected = { kind: "page", path: "notes/Other Note.md" };
    expect(resolveLink(map, link("Other Note.md"))).toEqual(expected);
    expect(resolveLink(map, link("Other Note.MD"))).toEqual(expected);
    expect(resolveLink(map, link("other note.md"))).toEqual(expected);
  });
  it("is ambiguous when two pages share the basename, never a pick", () => {
    expect(resolveLink(map, link("Dup"))).toEqual({ kind: "unavailable", reason: "ambiguous" });
  });
  it("is not-found for a missing note or an empty target", () => {
    expect(resolveLink(map, link("Nope"))).toEqual({ kind: "unavailable", reason: "not-found" });
    expect(resolveLink(map, link("  "))).toEqual({ kind: "unavailable", reason: "not-found" });
  });
  it("reports a missing heading as a partial match on the page (US-077)", () => {
    expect(resolveLink(map, link("Other Note", { heading: "H" }))).toEqual({
      kind: "page",
      path: "notes/Other Note.md",
      heading: { matched: false },
    });
  });
  it("does not resolve an embed kind yet", () => {
    expect(resolveLink(map, { kind: "embed-note", text: "Other Note" })).toEqual({ kind: "unavailable", reason: "not-found" });
  });
  it("does not resolve an asset by bare name as a note", () => {
    expect(resolveLink(mapOf(["img.png"]), link("img"))).toEqual({ kind: "unavailable", reason: "not-found" });
  });
});

describe("resolveLink: path-qualified (L5, L6)", () => {
  const map = mapOf(["folder/Note.md", "folder-a/Notes.md", "img/pic.png"]);
  it("resolves with and without .md", () => {
    expect(resolveLink(map, link("folder/Note"))).toEqual({ kind: "page", path: "folder/Note.md" });
    expect(resolveLink(map, link("folder/Note.md"))).toEqual({ kind: "page", path: "folder/Note.md" });
  });
  it("is case-sensitive", () => {
    expect(resolveLink(map, link("Folder/Note"))).toEqual({ kind: "unavailable", reason: "not-found" });
    expect(resolveLink(map, link("folder/note"))).toEqual({ kind: "unavailable", reason: "not-found" });
  });
  it("never falls back to a basename match (TC-213)", () => {
    expect(resolveLink(map, link("folder-b/Notes"))).toEqual({ kind: "unavailable", reason: "not-found" });
  });
  it("is not affected by a basename collision elsewhere", () => {
    const dup = mapOf(["a/Dup.md", "b/Dup.md"]);
    expect(resolveLink(dup, link("b/Dup"))).toEqual({ kind: "page", path: "b/Dup.md" });
  });
  it("does not treat an asset path as a page", () => {
    expect(resolveLink(map, link("img/pic.png"))).toEqual({ kind: "unavailable", reason: "not-found" });
  });
});
