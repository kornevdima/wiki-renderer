import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { insertRendered, renderBytesForWiki, renderCacheStore } from "@/content/render/render-cache";
import type { RenderedPage } from "@/content/render/types";

import { snapshotCacheStore, resetRuntimeStateForTests } from "./cache";
import type { WikiSnapshot } from "./types";

let dir: string;
let file: string;
let rt: typeof import("./index");

async function load(vars: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.stubEnv("WIKI_RENDERER_CONFIG", file);
  vi.stubEnv("WIKI_RECHECK_MS", "0");
  vi.stubEnv("WIKI_DIRS", "");
  vi.stubEnv("WIKI_PRINT_FILE_TITLE", "");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v as string);
  rt = await import("./index");
  rt.resetWikiListForTests();
}

let bump = 0;
async function writeCfg(doc: unknown) {
  await writeFile(file, typeof doc === "string" ? doc : JSON.stringify(doc));
  // Distinct mtime per write, whatever the filesystem's resolution.
  const t = new Date(Date.now() + 1000 * ++bump);
  await utimes(file, t, t);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wr-rt-"));
  file = path.join(dir, "config.json");
  resetRuntimeStateForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeStateForTests();
});

const A = { id: "a", name: "A", root: "/wikis/a" };
const B = { id: "b", name: "B", root: "/wikis/b" };

describe("listWikis from the config file", () => {
  it("no file: empty list, source file, not managed by env, no error", async () => {
    await load();
    expect(rt.getWikiList()).toMatchObject({ wikis: [], source: "file", managedByEnv: false, configPath: file });
    expect(rt.getWikiList().error).toBeUndefined();
  });

  it("picks up a change without a restart", async () => {
    await writeCfg({ wikis: [A] });
    await load();
    expect(rt.listWikis().map((w) => w.id)).toEqual(["a"]);
    await writeCfg({ wikis: [A, B] });
    expect(rt.listWikis().map((w) => w.id)).toEqual(["a", "b"]);
    expect(rt.findWiki("b")?.root).toBe("/wikis/b");
  });

  it("resolves ~ and relative roots (relative to the file's folder)", async () => {
    await writeCfg({ wikis: [{ id: "r", root: "rel" }] });
    await load();
    expect(rt.listWikis()[0]!.root).toBe(path.join(dir, "rel"));
  });
});

describe("a removed wiki's caches are dropped (R4)", () => {
  function seed(id: string) {
    snapshotCacheStore().set(id, { snapshot: { wikiId: id, sha: "s1" } as unknown as WikiSnapshot, sha: "s1", lastCheckedAt: 0 });
    insertRendered(id, `${id}:s1:p.md`, { path: "p.md" } as unknown as RenderedPage, 10);
  }

  it("drops snapshot, rendered pages and byte count of the removed wiki only", async () => {
    await writeCfg({ wikis: [A, B] });
    await load();
    rt.listWikis();
    seed("a");
    seed("b");
    await writeCfg({ wikis: [A] });
    rt.listWikis();
    expect(snapshotCacheStore().has("b")).toBe(false);
    expect([...renderCacheStore().keys()].some((k) => k.startsWith("b:"))).toBe(false);
    expect(renderBytesForWiki("b")).toBe(0);
    expect(snapshotCacheStore().has("a")).toBe(true);
    expect(renderBytesForWiki("a")).toBe(10);
  });

  it("drops a wiki that now points at another folder", async () => {
    await writeCfg({ wikis: [A] });
    await load();
    rt.listWikis();
    seed("a");
    await writeCfg({ wikis: [{ ...A, root: "/wikis/elsewhere" }] });
    rt.listWikis();
    expect(snapshotCacheStore().has("a")).toBe(false);
  });
});

describe("a build in flight when its wiki is removed or re-rooted (review finding 2)", () => {
  async function wikiDir(name: string) {
    const root = path.join(dir, name);
    await mkdir(root);
    await writeFile(path.join(root, "index.md"), "# Hi\n");
    return root;
  }

  it("does not write the dropped snapshot back when the wiki was removed", async () => {
    const root = await wikiDir("a");
    await writeCfg({ wikis: [{ id: "a", root }] });
    await load();
    const pending = rt.getSnapshot("a");
    await writeCfg({ wikis: [] });
    rt.listWikis();
    const result = await pending;
    expect(result.state).toBe("fresh");
    expect(snapshotCacheStore().has("a")).toBe(false);
  });

  it("does not cache it when the wiki now points at another folder", async () => {
    const root = await wikiDir("a");
    const other = await wikiDir("other");
    await writeCfg({ wikis: [{ id: "a", root }] });
    await load();
    const pending = rt.getSnapshot("a");
    await writeCfg({ wikis: [{ id: "a", root: other }] });
    rt.listWikis();
    await pending;
    expect(snapshotCacheStore().has("a")).toBe(false);
  });

  it("caches normally when nothing changed", async () => {
    const root = await wikiDir("a");
    await writeCfg({ wikis: [{ id: "a", root }] });
    await load();
    await rt.getSnapshot("a");
    expect(snapshotCacheStore().has("a")).toBe(true);
  });
});

describe("WIKI_DIRS overrides the file (R5)", () => {
  it("lists WIKI_DIRS only, source env, managedByEnv", async () => {
    await writeCfg({ wikis: [A] });
    await load({ WIKI_DIRS: "x=/wikis/x" });
    const list = rt.getWikiList();
    expect(list.wikis.map((w) => w.id)).toEqual(["x"]);
    expect(list).toMatchObject({ source: "env", managedByEnv: true });
  });

  it("a bad WIKI_DIRS still throws (startup exits on it)", async () => {
    await load({ WIKI_DIRS: "Bad Id=/x" });
    expect(() => rt.listWikis()).toThrow(/lowercase/);
  });
});

describe("printFileTitle (R6)", () => {
  it("comes from the file when the env is unset", async () => {
    await writeCfg({ printFileTitle: true });
    await load();
    expect(rt.printFileTitle()).toBe(true);
  });
  it("is false when neither is set", async () => {
    await load();
    expect(rt.printFileTitle()).toBe(false);
  });
  it("WIKI_PRINT_FILE_TITLE wins over the file, both ways", async () => {
    await writeCfg({ printFileTitle: true });
    await load({ WIKI_PRINT_FILE_TITLE: "false" });
    expect(rt.printFileTitle()).toBe(false);
    await writeCfg({ printFileTitle: false });
    await load({ WIKI_PRINT_FILE_TITLE: "true" });
    expect(rt.printFileTitle()).toBe(true);
  });
  it("follows a change of the file", async () => {
    await writeCfg({ printFileTitle: false });
    await load();
    expect(rt.printFileTitle()).toBe(false);
    await writeCfg({ printFileTitle: true });
    expect(rt.printFileTitle()).toBe(true);
  });
});

describe("a bad config file (R7)", () => {
  it("first read of invalid JSON: empty list, error names the file", async () => {
    await writeCfg("{ nope");
    await load();
    const list = rt.getWikiList();
    expect(list.wikis).toEqual([]);
    expect(list.error).toContain(file);
  });

  it.each([
    ["invalid JSON", "{ nope", /not valid JSON/],
    ["a bad id", { wikis: [{ id: "Bad Id", root: "/x" }] }, /lowercase/],
    ["a duplicate id", { wikis: [A, A] }, /listed twice/],
  ])("%s keeps the last good list and exposes the error; fixing it clears it", async (_name, bad, message) => {
    await writeCfg({ wikis: [A] });
    await load();
    expect(rt.listWikis().map((w) => w.id)).toEqual(["a"]);
    await writeCfg(bad);
    const broken = rt.getWikiList();
    expect(broken.wikis.map((w) => w.id)).toEqual(["a"]);
    expect(broken.error).toMatch(message);
    expect(broken.error).toContain(file);
    await writeCfg({ wikis: [B] });
    const fixed = rt.getWikiList();
    expect(fixed.wikis.map((w) => w.id)).toEqual(["b"]);
    expect(fixed.error).toBeUndefined();
  });

  it("assertWikisOrExit does not exit on a bad file", async () => {
    await writeCfg("{ nope");
    await load();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    rt.assertWikisOrExit();
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});

describe("state and timing of the file list (review finding 5)", () => {
  it("(a) the list state lives on globalThis: a re-imported module sees the last good list", async () => {
    await writeCfg({ wikis: [A] });
    await load();
    expect(rt.listWikis().map((w) => w.id)).toEqual(["a"]);
    await writeCfg("{ nope");
    expect(rt.getWikiList().error).toBeDefined();
    // A second copy of the module, as when instrumentation and a route bundle load it separately. No reset this time.
    vi.resetModules();
    const again = await import("./index");
    expect(again).not.toBe(rt);
    const list = again.getWikiList();
    expect(list.wikis.map((w) => w.id)).toEqual(["a"]); // a fresh state would have no last good list
    expect(list.error).toContain(file);
  });

  it("(b) deleting the file after a good list empties it: source file, no error", async () => {
    await writeCfg({ wikis: [A, B] });
    await load();
    expect(rt.listWikis()).toHaveLength(2);
    await rm(file);
    const list = rt.getWikiList();
    expect(list.wikis).toEqual([]);
    expect(list).toMatchObject({ source: "file", managedByEnv: false, configPath: file });
    expect(list.error).toBeUndefined();
  });

  describe("(c) the recheck throttle", () => {
    afterEach(() => vi.useRealTimers());

    it("a file change is not seen inside WIKI_RECHECK_MS, and is seen once the window has passed", async () => {
      await writeCfg({ wikis: [A] });
      await load({ WIKI_RECHECK_MS: "60000" });
      vi.useFakeTimers({ toFake: ["Date"] });
      expect(rt.listWikis().map((w) => w.id)).toEqual(["a"]);
      await writeCfg({ wikis: [A, B] });
      vi.setSystemTime(Date.now() + 59_000);
      expect(rt.listWikis().map((w) => w.id)).toEqual(["a"]); // still inside the window
      vi.setSystemTime(Date.now() + 2_000);
      expect(rt.listWikis().map((w) => w.id)).toEqual(["a", "b"]);
    });

    it("a deletion is throttled the same way", async () => {
      await writeCfg({ wikis: [A] });
      await load({ WIKI_RECHECK_MS: "60000" });
      vi.useFakeTimers({ toFake: ["Date"] });
      rt.listWikis();
      await rm(file);
      expect(rt.listWikis()).toHaveLength(1);
      vi.setSystemTime(Date.now() + 60_001);
      expect(rt.listWikis()).toEqual([]);
    });
  });
});
