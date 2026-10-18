import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { absoluteFolder, maxBytesFromEnv, runAdd, runList, runRemove, type CommandContext } from "./commands";
import messages from "../../messages/en.json";

let tmp: string;
let out: string[];
let err: string[];

function ctx(env: Record<string, string | undefined> = {}, cwd = tmp): CommandContext {
  return {
    configPath: path.join(tmp, "config", "config.json"),
    env,
    cwd,
    serverCwd: path.join(tmp, "install"),
    home: path.join(tmp, "home"),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
}

const configText = async () => readFile(path.join(tmp, "config", "config.json"), "utf8").catch(() => null);

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "wr-cli-"));
  out = [];
  err = [];
  await mkdir(path.join(tmp, "notes"), { recursive: true });
  await writeFile(path.join(tmp, "notes", "a.md"), "# a");
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("absoluteFolder", () => {
  it("resolves a relative folder against the shell's folder and leaves ~ and absolute paths as typed", () => {
    expect(absoluteFolder("notes", "/work")).toBe(path.resolve("/work", "notes"));
    expect(absoluteFolder(".", "/work")).toBe(path.resolve("/work"));
    expect(absoluteFolder("~/notes", "/work")).toBe("~/notes");
    expect(absoluteFolder("/abs/notes", "/work")).toBe("/abs/notes");
  });
});

describe("maxBytesFromEnv", () => {
  it("reads WIKI_MAX_BYTES as the server does, else 50 MiB", () => {
    expect(maxBytesFromEnv({ WIKI_MAX_BYTES: "1000" })).toBe(1000);
    expect(maxBytesFromEnv({})).toBe(52_428_800);
    expect(maxBytesFromEnv({ WIKI_MAX_BYTES: "  " })).toBe(52_428_800);
    expect(maxBytesFromEnv({ WIKI_MAX_BYTES: "-5" })).toBe(52_428_800);
    expect(maxBytesFromEnv({ WIKI_MAX_BYTES: "abc" })).toBe(52_428_800);
  });
});

describe("add", () => {
  it("adds a relative folder, stored as the full path, with the id and name WIKI_DIRS would give", async () => {
    expect(await runAdd(ctx(), "notes")).toBe(0);
    const saved = JSON.parse((await configText())!);
    expect(saved.wikis).toEqual([{ id: "notes", name: "Notes", root: path.join(tmp, "notes") }]);
    expect(out).toEqual([`Added notes: ${path.join(tmp, "notes")}`]);
  });

  it("takes --id", async () => {
    expect(await runAdd(ctx(), "notes", "mine")).toBe(0);
    expect(JSON.parse((await configText())!).wikis[0]).toMatchObject({ id: "mine", name: "Mine" });
  });

  it("refuses with the Settings sentences and leaves the file alone", async () => {
    await runAdd(ctx(), "notes");
    const before = await configText();
    err.length = 0;

    expect(await runAdd(ctx(), "nope")).toBe(1);
    expect(err.pop()).toBe(messages.settings.errors.not_found);
    expect(await runAdd(ctx(), "notes")).toBe(1);
    expect(err.pop()).toBe(messages.settings.errors.already_listed);
    expect(await runAdd(ctx(), path.join("notes", "a.md"))).toBe(1);
    expect(err.pop()).toBe(messages.settings.errors.not_a_folder);
    expect(await runAdd(ctx(), "")).toBe(1);
    expect(err.pop()).toBe(messages.settings.errors.empty);
    expect(await configText()).toBe(before);
  });

  it("refuses a folder over WIKI_MAX_BYTES with the size and the limit", async () => {
    await writeFile(path.join(tmp, "notes", "big.md"), "x".repeat(3000));
    expect(await runAdd(ctx({ WIKI_MAX_BYTES: "1000" }), "notes")).toBe(1);
    expect(err[0]).toMatch(/^This folder is at least .+, over the 1000 B limit\.$/);
    expect(await configText()).toBeNull();
  });

  it("refuses a taken or invalid --id", async () => {
    await runAdd(ctx(), "notes", "mine");
    await mkdir(path.join(tmp, "other"));
    expect(await runAdd(ctx(), "other", "mine")).toBe(1);
    expect(err.pop()).toBe('A wiki with the id "mine" is already listed.');
    expect(await runAdd(ctx(), "other", "Not Valid")).toBe(1);
    expect(err.pop()).toMatch(/is not a valid id/);
  });

  it("refuses when WIKI_DIRS manages the list", async () => {
    expect(await runAdd(ctx({ WIKI_DIRS: "a=/x" }), "notes")).toBe(1);
    expect(err).toEqual([messages.settings.errors.managed_by_env]);
    expect(await configText()).toBeNull();
  });

  it("treats a blank WIKI_DIRS as unset, as the server does", async () => {
    expect(await runAdd(ctx({ WIKI_DIRS: "  " }), "notes")).toBe(0);
  });

  it("says why a bad config file blocks it, and does not overwrite it", async () => {
    await mkdir(path.join(tmp, "config"));
    await writeFile(path.join(tmp, "config", "config.json"), "{not json");
    expect(await runAdd(ctx(), "notes")).toBe(1);
    expect(err[0]).toMatch(/^The config file could not be updated: .*is not valid JSON/);
    expect(await configText()).toBe("{not json");
  });
});

describe("remove", () => {
  it("removes a listed wiki and leaves the folder", async () => {
    await runAdd(ctx(), "notes");
    expect(await runRemove(ctx(), "notes")).toBe(0);
    expect(JSON.parse((await configText())!).wikis).toEqual([]);
    expect(await readFile(path.join(tmp, "notes", "a.md"), "utf8")).toBe("# a");
  });

  it("refuses an unknown id and WIKI_DIRS, writing nothing", async () => {
    await runAdd(ctx(), "notes");
    const before = await configText();
    expect(await runRemove(ctx(), "ghost")).toBe(1);
    expect(err.pop()).toBe('No wiki with the id "ghost" is listed.');
    expect(await runRemove(ctx({ WIKI_DIRS: "a=/x" }), "notes")).toBe(1);
    expect(err.pop()).toBe(messages.settings.errors.managed_by_env);
    expect(await configText()).toBe(before);
  });
});

describe("list", () => {
  it("says so when there is nothing, with no file", async () => {
    expect(await runList(ctx())).toBe(0);
    expect(out).toEqual(["No wikis yet. Add one with: wiki-renderer add <folder>"]);
  });

  it("prints id, name and folder in the file's order", async () => {
    await mkdir(path.join(tmp, "second"));
    await runAdd(ctx(), "notes");
    await runAdd(ctx(), "second", "two");
    out.length = 0;
    expect(await runList(ctx())).toBe(0);
    expect(out).toEqual([
      `notes  Notes  ${path.join(tmp, "notes")}`,
      `two    Two    ${path.join(tmp, "second")}`,
    ]);
  });

  it("shows the WIKI_DIRS list and says it decides", async () => {
    expect(await runList(ctx({ WIKI_DIRS: `docs=${path.join(tmp, "notes")}` }))).toBe(0);
    expect(out[0]).toMatch(/^WIKI_DIRS is set/);
    expect(out[1]).toBe(`docs  Docs  ${path.join(tmp, "notes")}`);
  });

  it("names a bad file", async () => {
    await mkdir(path.join(tmp, "config"));
    await writeFile(path.join(tmp, "config", "config.json"), "[]");
    expect(await runList(ctx())).toBe(1);
    expect(err[0]).toMatch(/expected a JSON object/);
  });
});
