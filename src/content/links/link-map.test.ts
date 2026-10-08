import { describe, expect, it } from "vitest";
import { parsePages } from "@/content/render/parse";
import type { FileEntry } from "@/content/runtime/types";
import { buildLinkMap } from "./link-map";

const enc = new TextEncoder();
function mapOf(entries: Record<string, string>, wikiId = "wiki-1", sha = "sha-1") {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]),
  );
  const pages = parsePages(files);
  return buildLinkMap(pages, files, wikiId, sha);
}

describe("buildLinkMap (L4, S6-L1, S6-L5)", () => {
  it("puts an asset with no page counterpart in assetBasenameIndex (exact case) and pathIndex", () => {
    const map = mapOf({ "img/Logo.PNG": "x", "a.md": "# a" });
    expect(map.assetBasenameIndex.get("Logo.PNG")).toEqual(["img/Logo.PNG"]);
    expect(map.assetBasenameIndex.get("logo.png")).toBeUndefined();
    expect(map.pathIndex.get("img/Logo.PNG")).toBe("img/Logo.PNG");
    expect(map.basenameIndexFolded.has("logo")).toBe(false);
  });

  it("keeps a note and a same-stem image apart: the note in the basename index, the image in the asset index", () => {
    const map = mapOf({ "Note.md": "# n", "Note.png": "x" });
    expect(map.basenameIndexFolded.get("note")).toEqual(["Note.md"]);
    expect(map.assetBasenameIndex.get("Note.png")).toEqual(["Note.png"]);
    expect(map.assetBasenameIndex.has("Note.md")).toBe(false);
    expect(map.pathIndex.get("Note.md")).toBe("Note.md");
  });

  it("folds note basenames and collects every candidate path", () => {
    const map = mapOf({ "a/Dup.md": "#", "b/dup.md": "#", "c/Other.MD": "#" });
    expect(map.basenameIndexFolded.get("dup")).toEqual(["a/Dup.md", "b/dup.md"]);
    expect(map.basenameIndexFolded.get("other")).toEqual(["c/Other.MD"]);
  });

  it("indexes aliases (lower-case) and heading slugs per page", () => {
    const map = mapOf({ "p.md": "---\naliases: [Alpha Beta]\n---\n# One\n\n## Two\n" });
    expect(map.aliasIndex.get("alpha beta")).toEqual(["p.md"]);
    expect([...(map.headingIndex.get("p.md") ?? [])]).toEqual(["one", "two"]);
  });

  it("fills wikiId and sha", () => {
    const map = mapOf({ "a.md": "#" }, "w-9", "s-9");
    expect(map.wikiId).toBe("w-9");
    expect(map.sha).toBe("s-9");
  });

  it("is frozen: replacing a field throws in strict mode, and the candidate lists are frozen", () => {
    const map = mapOf({ "a/Dup.md": "#", "b/Dup.md": "#", "x.png": "x" });
    expect(Object.isFrozen(map)).toBe(true);
    expect(() => {
      (map as { sha: string }).sha = "other";
    }).toThrow(TypeError);
    expect(Object.isFrozen(map.basenameIndexFolded.get("dup"))).toBe(true);
    expect(Object.isFrozen(map.assetBasenameIndex.get("x.png"))).toBe(true);
    expect(map.sha).toBe("sha-1");
  });
});
