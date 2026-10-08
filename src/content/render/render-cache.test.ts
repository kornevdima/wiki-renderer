import { emptyLinkMap } from "@/content/links/link-map.testing";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotCacheStore } from "@/content/runtime/cache";
import { resetRuntimeStateForTests } from "@/content/runtime/cache";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";

vi.mock("./pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline")>();
  return { ...actual, mdastToHast: vi.fn(actual.mdastToHast) };
});

import { parsePages } from "./parse";
import { mdastToHast } from "./pipeline";
import { renderPage } from "./render";
import { dropRenderedForWiki, renderCacheStore } from "./render-cache";
import { renderCacheKeysForTests, resetRenderCacheForTests } from "./render-cache.testing";
import type { RenderedPage } from "./types";

const enc = new TextEncoder();
function snap(sha: string, entries: Record<string, string> = { "a.md": "## Setup\n\nbody" }, wikiId = "0a1b"): WikiSnapshot {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "text/markdown" }]),
  );
  return { wikiId, sha, files, pages: parsePages(files), linkMap: emptyLinkMap(), searchIndexJson: "", tree: [] };
}
/**
 * Renders as the wiki's current snapshot: US-058 D5 caches a render only for the snapshot that is the cached one, so
 * the helper installs `s` as it (the stand-in for a swap) before each render.
 */
function page(s: WikiSnapshot, path: string): RenderedPage {
  snapshotCacheStore().set(s.wikiId, { snapshot: s, sha: s.sha, lastCheckedAt: 0 });
  const r = renderPage(s, path);
  if ("state" in r) throw new Error("unavailable");
  return r;
}

beforeEach(() => {
  resetRuntimeStateForTests();
  resetRenderCacheForTests();
  vi.mocked(mdastToHast).mockClear();
});

describe("render cache: populate and hit (S13, S14)", () => {
  it("renders once and stores the entry under wikiId:sha:path", () => {
    const s = snap("aa11");
    expect(renderCacheKeysForTests()).toEqual([]);
    page(s, "a.md");
    expect(mdastToHast).toHaveBeenCalledTimes(1);
    expect(renderCacheKeysForTests()).toEqual(["0a1b:aa11:a.md"]);
  });
  it("returns the same object on a second call without running the pipeline", () => {
    const s = snap("aa11");
    const first = page(s, "a.md");
    const second = page(s, "a.md");
    expect(second).toBe(first);
    expect(mdastToHast).toHaveBeenCalledTimes(1);
  });
  it("keys a path containing a colon unambiguously", () => {
    const s = snap("aa11", { "a:b.md": "x" });
    page(s, "a:b.md");
    expect(renderCacheKeysForTests()).toEqual(["0a1b:aa11:a:b.md"]);
  });
  it("keeps different wikis and paths apart", () => {
    const a = page(snap("aa11"), "a.md");
    const b = page(snap("aa11", { "a.md": "other" }, "0c2d"), "a.md");
    expect(b).not.toBe(a);
    expect(renderCacheKeysForTests()).toHaveLength(2);
  });
});

describe("render cache: viewer-free (S15)", () => {
  it("takes exactly a snapshot and a path, and keys only wiki, sha and path", () => {
    expect(renderPage.length).toBe(2);
    page(snap("aa11"), "a.md");
    expect(renderCacheKeysForTests()).toEqual(["0a1b:aa11:a.md"]);
  });
  it("gives two viewers the identical object", () => {
    const s = snap("aa11");
    const forViewerOne = page(s, "a.md");
    const forViewerTwo = page(s, "a.md");
    expect(forViewerTwo).toBe(forViewerOne);
  });
});

describe("render cache: immutable per SHA (S16)", () => {
  it("adds a second entry for a new SHA and leaves the first frozen and identical", () => {
    const first = page(snap("aa11"), "a.md");
    const contentBefore = renderToStaticMarkup(first.content);
    const second = page(snap("bb22", { "a.md": "# Changed" }), "a.md");
    expect(second).not.toBe(first);
    expect(renderCacheKeysForTests().sort()).toEqual(["0a1b:aa11:a.md", "0a1b:bb22:a.md"]);
    expect(page(snap("aa11"), "a.md")).toBe(first);
    expect(renderToStaticMarkup(first.content)).toBe(contentBefore);
    expect(Object.isFrozen(first)).toBe(true);
    // headings is frozen at parse time (parsePages, BR-036); this only confirms it stays frozen through the cache.
    expect(Object.isFrozen(first.headings)).toBe(true);
    expect(() => {
      (first as { title: string }).title = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (first.headings as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });
});

describe("render cache: unavailable is not cached (S17)", () => {
  it("returns unavailable twice, leaves no entry, and renders once the path exists", () => {
    expect(renderPage(snap("aa11"), "b.md")).toEqual({ state: "unavailable" });
    expect(renderPage(snap("aa11"), "b.md")).toEqual({ state: "unavailable" });
    expect(renderCacheKeysForTests()).toEqual([]);
    const later = page(snap("bb22", { "b.md": "hi" }), "b.md");
    expect("state" in later).toBe(false);
    expect(renderCacheKeysForTests()).toEqual(["0a1b:bb22:b.md"]);
  });
});

describe("render cache: back-to-back requests (S18, TC-225)", () => {
  it("renders an uncached page once and hands both callers the identical result", () => {
    const s = snap("aa11");
    const [one, two] = [page(s, "a.md"), page(s, "a.md")];
    expect(mdastToHast).toHaveBeenCalledTimes(1);
    expect(two).toBe(one);
    expect(renderToStaticMarkup(one.content)).toContain("Setup");
    expect(renderToStaticMarkup(two.content)).toBe(renderToStaticMarkup(one.content));
  });
});

describe("dropRenderedForWiki (US-056, T6)", () => {
  it("removes exactly the wiki's entries by the `wikiId:` prefix; a wiki whose id merely starts with it, and others, stay", () => {
    const store = renderCacheStore();
    for (const key of ["0a1b:aa11:a.md", "0a1b:bb22:x/y:z.md", "0a1bc:aa11:a.md", "ffff:aa11:a.md"]) {
      store.set(key, {} as RenderedPage);
    }
    expect(dropRenderedForWiki("0a1b")).toBe(2);
    expect(renderCacheKeysForTests()).toEqual(["0a1bc:aa11:a.md", "ffff:aa11:a.md"]);
    expect(dropRenderedForWiki("0a1b")).toBe(0);
  });
});
