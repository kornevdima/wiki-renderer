/**
 * Unit specs for `build` (US-060/US-051/US-061; contract S1, S2, S12, S13, S14).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/content/render/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/render/pipeline")>();
  return { ...actual, parseMarkdown: vi.fn(actual.parseMarkdown) };
});
vi.mock("@/content/render/parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/render/parse")>();
  return { ...actual, parsePages: vi.fn(actual.parsePages) };
});
vi.mock("@/content/links/link-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/links/link-map")>();
  return { ...actual, buildLinkMap: vi.fn(actual.buildLinkMap) };
});
vi.mock("@/content/search/build-index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/search/build-index")>();
  return { ...actual, buildSearchIndex: vi.fn(actual.buildSearchIndex) };
});
vi.mock("./tree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tree")>();
  return { ...actual, buildTree: vi.fn(actual.buildTree) };
});

import { buildLinkMap } from "@/content/links/link-map";
import { getHighlighter } from "@/content/render/highlighter";
import { resetHighlighterForTests } from "@/content/render/highlighter.testing";
import { parsePages } from "@/content/render/parse";
import { parseMarkdown } from "@/content/render/pipeline";
import { renderPage } from "@/content/render/render";
import { resetRenderCacheForTests } from "@/content/render/render-cache.testing";
import { buildSearchIndex } from "@/content/search/build-index";
import type { ContentSource } from "./source";
import { build, contentTypeFor } from "./build";
import { buildTree } from "./tree";

const enc = new TextEncoder();

function sourceOf(entries: Record<string, string>, sha = "sha1"): ContentSource {
  return {
    getLatestSha: async () => sha,
    fetchTree: async (s) => ({
      sha: s,
      files: new Map(Object.entries(entries).map(([p, t]) => [p, enc.encode(t)])),
      totalBytes: 0,
    }),
  };
}

const WIKI = {
  "index.md": "# Home\n\nhello",
  "a/one.md": "---\ntitle: One!\n---\n# One\n\ntext",
  "a/b/two.md": "# Two",
  "img/x.png": "png-bytes",
};

beforeEach(() => {
  vi.mocked(parsePages).mockClear();
  vi.mocked(parseMarkdown).mockClear();
  vi.mocked(buildLinkMap).mockClear();
  vi.mocked(buildSearchIndex).mockClear();
  vi.mocked(buildTree).mockClear();
  resetRenderCacheForTests();
});

describe("build shares one parse pass (S1, S2, S12)", () => {
  it("S1: parsePages runs once; link map and search index receive the identical pages map", async () => {
    const snapshot = await build("w", "sha1", sourceOf(WIKI));
    expect(parsePages).toHaveBeenCalledTimes(1);
    expect(buildLinkMap).toHaveBeenCalledTimes(1);
    expect(buildSearchIndex).toHaveBeenCalledTimes(1);
    const pagesArg = vi.mocked(parsePages).mock.results[0]!.value;
    expect(vi.mocked(buildLinkMap).mock.calls[0]![0]).toBe(pagesArg);
    expect(vi.mocked(buildSearchIndex).mock.calls[0]![0]).toBe(pagesArg);
    expect(snapshot.pages).toBe(pagesArg);
  });

  it("S12: parsePages gets the fetched files map and buildTree gets the same pages map that was parsed", async () => {
    const snapshot = await build("w", "sha1", sourceOf(WIKI));
    expect(vi.mocked(parsePages).mock.calls[0]![0]).toBe(snapshot.files);
    expect(vi.mocked(buildTree).mock.calls[0]![0]).toBe(snapshot.pages);
  });

  it("S2: reading the snapshot and rendering every page adds no parse (N pages, N parses)", async () => {
    const snapshot = await build("w", "sha1", sourceOf(WIKI));
    expect(snapshot.pages.size).toBe(3);
    expect(parseMarkdown).toHaveBeenCalledTimes(3);
    void snapshot.linkMap;
    void snapshot.searchIndexJson;
    for (const path of snapshot.pages.keys()) renderPage(snapshot, path);
    expect(parsePages).toHaveBeenCalledTimes(1);
    expect(parseMarkdown).toHaveBeenCalledTimes(3);
  });

  it("assembles a complete snapshot: files with content types, pages, link map, index, tree", async () => {
    const snapshot = await build("w", "sha1", sourceOf(WIKI));
    expect(snapshot.wikiId).toBe("w");
    expect(snapshot.sha).toBe("sha1");
    expect([...snapshot.files.keys()].sort()).toEqual(["a/b/two.md", "a/one.md", "img/x.png", "index.md"]);
    expect(snapshot.files.get("img/x.png")?.contentType).toBe("image/png");
    expect(snapshot.pages.get("a/one.md")?.title).toBe("One!");
    expect(JSON.parse(snapshot.searchIndexJson)).toMatchObject({ documentCount: expect.any(Number) });
    expect(snapshot.linkMap).toMatchObject({ wikiId: "w", sha: "sha1" });
    expect(snapshot.linkMap.pathIndex.get("img/x.png")).toBe("img/x.png");
    expect(snapshot.tree.map((n) => n.name)).toEqual(["a", "index"]);
  });
});

describe("build immutability (S13)", () => {
  it("the snapshot object and its tree are frozen; a write throws", async () => {
    const snapshot = await build("w", "sha1", sourceOf(WIKI));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tree)).toBe(true);
    expect(() => {
      (snapshot as { sha: string }).sha = "other";
    }).toThrow(TypeError);
    expect(() => {
      snapshot.tree.push({ kind: "page", name: "x", path: "x.md", title: "x" });
    }).toThrow(TypeError);
  });
});

describe("contentTypeFor (S14)", () => {
  it("resolves the table's types, extension case-insensitive", () => {
    expect(contentTypeFor("a.md")).toBe("text/markdown; charset=utf-8");
    expect(contentTypeFor("dir/b.PNG")).toBe("image/png");
    expect(contentTypeFor("c.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("d.bin")).toBe("application/octet-stream");
    expect(contentTypeFor("e.JPeG")).toBe("image/jpeg");
    expect(contentTypeFor("f.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("g.gif")).toBe("image/gif");
    expect(contentTypeFor("h.webp")).toBe("image/webp");
    expect(contentTypeFor("i.pdf")).toBe("application/pdf");
  });

  it("no extension, or a dotted directory with an extensionless file, is octet-stream", () => {
    expect(contentTypeFor("LICENSE")).toBe("application/octet-stream");
    expect(contentTypeFor("dir.md/LICENSE")).toBe("application/octet-stream");
    expect(contentTypeFor(".md")).toBe("text/markdown; charset=utf-8");
  });
});

describe("build primes the Shiki highlighter (US-072, S6-A2)", () => {
  it("K9 unit half: after build() a ts fence renders highlighted; without priming it renders plain (fail closed)", async () => {
    resetHighlighterForTests();
    const source = sourceOf({ "c.md": "```ts\nlet a = 1;\n```\n" });
    const html = (snapshot: Awaited<ReturnType<typeof build>>) => {
      const r = renderPage(snapshot, "c.md");
      if ("state" in r) throw new Error("unavailable");
      return renderToStaticMarkup(r.content);
    };
    const primed = await build("w", "shiki1", source);
    expect(getHighlighter()).toBeDefined();
    expect(html(primed)).toContain('<pre class="shiki css-variables" tabindex="0">');
    resetRenderCacheForTests();
    resetHighlighterForTests();
    expect(html(primed)).not.toContain("shiki");
  });
});
