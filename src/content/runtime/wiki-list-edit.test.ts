import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyChange, checkNewFolder, moved, removed, renamed, uniqueId, type ChangeContext } from "./wiki-list-edit";
import { writeUserConfig, type UserConfig } from "./user-config";

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wr-settings-"));
  configPath = path.join(dir, "cfg", "config.json");
});
afterEach(async () => {
  await chmod(path.join(dir, "locked"), 0o755).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

async function folder(name: string, bytes = 10): Promise<string> {
  const p = path.join(dir, name);
  await mkdir(p, { recursive: true });
  await writeFile(path.join(p, "a.md"), "x".repeat(bytes));
  return p;
}

const ctx = (over: Partial<ChangeContext> = {}): ChangeContext => ({
  host: "127.0.0.1:3000",
  port: 3000,
  configPath,
  managedByEnv: false,
  maxBytes: 1000,
  home: dir,
  ...over,
});

const seed = (wikis: UserConfig["wikis"], printFileTitle = false) => writeUserConfig(configPath, { wikis, printFileTitle });
const bytes = () => readFile(configPath, "utf8");
const stored = async () => JSON.parse(await bytes()) as UserConfig;

describe("uniqueId", () => {
  it("suffixes -2, -3 on a collision and never returns an empty id", () => {
    expect(uniqueId("notes", new Set())).toBe("notes");
    expect(uniqueId("notes", new Set(["notes"]))).toBe("notes-2");
    expect(uniqueId("notes", new Set(["notes", "notes-2"]))).toBe("notes-3");
    expect(uniqueId("", new Set())).toBe("wiki");
  });
});

describe("checkNewFolder", () => {
  const opts = (existing: UserConfig["wikis"] = []) => ({ existing, configDir: path.join(dir, "cfg"), maxBytes: 1000, home: dir });

  it("derives id and name as WIKI_DIRS does and keeps the path as typed", async () => {
    await folder("ESG Project");
    const abs = path.join(dir, "ESG Project");
    expect(await checkNewFolder(abs, opts())).toEqual({ ok: true, wiki: { id: "esg-project", name: "Esg Project", root: abs } });
    const result = await checkNewFolder("~/ESG Project", opts());
    expect(result).toEqual({ ok: true, wiki: { id: "esg-project", name: "Esg Project", root: "~/ESG Project" } });
  });

  it("takes the id from the parent when the folder is called wiki", async () => {
    await folder("vault/wiki");
    const result = await checkNewFolder(path.join(dir, "vault", "wiki"), opts());
    expect(result).toMatchObject({ ok: true, wiki: { id: "vault" } });
  });

  it("suffixes an id that collides with a listed wiki on another folder", async () => {
    const a = await folder("a/notes");
    const b = await folder("b/notes");
    const first = await checkNewFolder(a, opts());
    if (!first.ok) throw new Error("expected ok");
    const second = await checkNewFolder(b, opts([first.wiki]));
    if (!second.ok) throw new Error("expected ok");
    expect(second).toMatchObject({ ok: true, wiki: { id: "notes-2", name: "Notes 2" } });
    const third = await checkNewFolder(await folder("c/notes"), opts([first.wiki, second.wiki]));
    expect(third).toMatchObject({ ok: true, wiki: { id: "notes-3" } });
  });

  it("refuses an empty or relative path", async () => {
    expect(await checkNewFolder("   ", opts())).toEqual({ ok: false, reason: "empty" });
    expect(await checkNewFolder("notes/wiki", opts())).toEqual({ ok: false, reason: "not_absolute" });
  });

  it("refuses a path that does not exist", async () => {
    expect(await checkNewFolder(path.join(dir, "missing"), opts())).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses a file", async () => {
    const file = path.join(dir, "file.md");
    await writeFile(file, "x");
    expect(await checkNewFolder(file, opts())).toEqual({ ok: false, reason: "not_a_folder" });
    expect(await checkNewFolder(path.join(file, "inside"), opts())).toEqual({ ok: false, reason: "not_found" });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("refuses a folder that cannot be read", async () => {
    const locked = await folder("locked");
    await chmod(locked, 0o000);
    expect(await checkNewFolder(locked, opts())).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses a folder already listed, whatever the spelling (~, symlink)", async () => {
    const real = await folder("real");
    const link = path.join(dir, "link");
    await symlink(real, link);
    const listed = [{ id: "real", name: "Real", root: "~/real" }];
    expect(await checkNewFolder(real, opts(listed))).toEqual({ ok: false, reason: "already_listed" });
    expect(await checkNewFolder(link, opts(listed))).toEqual({ ok: false, reason: "already_listed" });
  });

  it("refuses a folder over the size limit with the size and the limit", async () => {
    const big = await folder("big", 2000);
    expect(await checkNewFolder(big, opts())).toEqual({ ok: false, reason: "too_large", bytes: 2000, limit: 1000 });
  });

  it("checks in the documented order: found, folder, readable, listed, size", async () => {
    const big = await folder("big", 2000);
    const listed = [{ id: "big", name: "Big", root: big }];
    expect(await checkNewFolder(big, opts(listed))).toEqual({ ok: false, reason: "already_listed" });
  });
});

describe("list edits", () => {
  const config: UserConfig = {
    printFileTitle: false,
    wikis: [
      { id: "a", name: "A", root: "/a" },
      { id: "b", name: "B", root: "/b" },
      { id: "c", name: "C", root: "/c" },
    ],
  };
  const ids = (c: UserConfig | null) => c?.wikis.map((w) => w.id).join("");

  it("moves up and down, and does nothing at the ends or for an unknown id", () => {
    expect(ids(moved(config, "b", "up"))).toBe("bac");
    expect(ids(moved(config, "b", "down"))).toBe("acb");
    expect(moved(config, "a", "up")).toBeNull();
    expect(moved(config, "c", "down")).toBeNull();
    expect(moved(config, "zz", "up")).toBeNull();
  });
  it("renames only the named wiki and reports no change for the same name", () => {
    expect(renamed(config, "b", "Bee")?.wikis.map((w) => w.name)).toEqual(["A", "Bee", "C"]);
    expect(renamed(config, "b", "B")).toBeNull();
  });
  it("removes only the named wiki", () => {
    expect(ids(removed(config, "b"))).toBe("ac");
  });
});

describe("applyChange", () => {
  it("adds a wiki and writes the file", async () => {
    const root = await folder("notes");
    const outcome = await applyChange({ kind: "add", folder: root }, ctx());
    expect(outcome).toMatchObject({ ok: true, wiki: { id: "notes", name: "Notes", root } });
    expect((await stored()).wikis).toEqual([{ id: "notes", name: "Notes", root }]);
  });

  it("writes nothing on each add refusal (file bytes unchanged)", async () => {
    const root = await folder("notes");
    await seed([{ id: "notes", name: "Notes", root }]);
    const before = await bytes();
    const file = path.join(dir, "f.md");
    await writeFile(file, "x");
    const big = await folder("big", 2000);
    for (const [folderArg, reason] of [
      [path.join(dir, "missing"), "not_found"],
      [file, "not_a_folder"],
      [root, "already_listed"],
      [big, "too_large"],
    ] as const) {
      expect(await applyChange({ kind: "add", folder: folderArg }, ctx())).toMatchObject({ ok: false, reason });
      expect(await bytes()).toBe(before);
    }
  });

  it("refuses every change when WIKI_DIRS manages the list, writing nothing", async () => {
    await seed([{ id: "a", name: "A", root: "/a" }], false);
    const before = await bytes();
    const root = await folder("notes");
    const changes = [
      { kind: "add", folder: root },
      { kind: "rename", id: "a", name: "Z" },
      { kind: "move", id: "a", direction: "down" },
      { kind: "remove", id: "a" },
      { kind: "printFileTitle", value: true },
    ];
    for (const change of changes) {
      expect(await applyChange(change, ctx({ managedByEnv: true }))).toEqual({ ok: false, reason: "managed_by_env" });
    }
    expect(await bytes()).toBe(before);
  });

  it("refuses a Host that is not 127.0.0.1 or localhost on the app's port, writing nothing", async () => {
    await seed([{ id: "a", name: "A", root: "/a" }]);
    const before = await bytes();
    for (const host of ["evil.example:3000", "127.0.0.1:9999", "127.0.0.1", null]) {
      expect(await applyChange({ kind: "remove", id: "a" }, ctx({ host }))).toEqual({ ok: false, reason: "forbidden_host" });
    }
    expect(await bytes()).toBe(before);
  });

  it("re-reads the file before writing: a change made on disk since the page loaded is kept", async () => {
    await seed([{ id: "a", name: "A", root: "/a" }]);
    // The page loaded here. Another process then adds "b" and turns the print setting on.
    await seed([{ id: "a", name: "A", root: "/a" }, { id: "b", name: "B", root: "/b" }], true);
    expect(await applyChange({ kind: "rename", id: "a", name: "Alpha" }, ctx())).toEqual({ ok: true });
    expect(await stored()).toEqual({
      wikis: [{ id: "a", name: "Alpha", root: "/a" }, { id: "b", name: "B", root: "/b" }],
      printFileTitle: true,
    });
  });

  it("moves, removes and sets the print setting through the file", async () => {
    await seed([{ id: "a", name: "A", root: "/a" }, { id: "b", name: "B", root: "/b" }]);
    expect(await applyChange({ kind: "move", id: "b", direction: "up" }, ctx())).toEqual({ ok: true });
    expect((await stored()).wikis.map((w) => w.id)).toEqual(["b", "a"]);
    expect(await applyChange({ kind: "printFileTitle", value: true }, ctx())).toEqual({ ok: true });
    expect((await stored()).printFileTitle).toBe(true);
    expect(await applyChange({ kind: "remove", id: "b" }, ctx())).toEqual({ ok: true });
    expect((await stored()).wikis.map((w) => w.id)).toEqual(["a"]);
  });

  it("never touches the removed wiki's folder", async () => {
    const root = await folder("notes");
    await seed([{ id: "notes", name: "Notes", root }]);
    await applyChange({ kind: "remove", id: "notes" }, ctx());
    expect(await readFile(path.join(root, "a.md"), "utf8")).toBe("x".repeat(10));
  });

  it("reports an unknown id and an invalid name or input, writing nothing", async () => {
    await seed([{ id: "a", name: "A", root: "/a" }]);
    const before = await bytes();
    expect(await applyChange({ kind: "remove", id: "zz" }, ctx())).toEqual({ ok: false, reason: "not_listed" });
    expect(await applyChange({ kind: "rename", id: "a", name: "   " }, ctx())).toEqual({ ok: false, reason: "name_empty" });
    expect(await applyChange({ kind: "rename", id: "a", name: "x".repeat(101) }, ctx())).toEqual({ ok: false, reason: "name_too_long" });
    expect(await applyChange({ kind: "bogus" }, ctx())).toEqual({ ok: false, reason: "invalid" });
    expect(await applyChange({ kind: "printFileTitle", value: "yes" }, ctx())).toEqual({ ok: false, reason: "invalid" });
    expect(await bytes()).toBe(before);
  });

  it("does not overwrite a bad config file", async () => {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "{ not json");
    const outcome = await applyChange({ kind: "printFileTitle", value: true }, ctx());
    expect(outcome).toMatchObject({ ok: false, reason: "config_error" });
    expect(await bytes()).toBe("{ not json");
  });

  it("creates the config file when none exists", async () => {
    expect(await applyChange({ kind: "printFileTitle", value: true }, ctx())).toEqual({ ok: true });
    expect((await stored()).printFileTitle).toBe(true);
  });
});
