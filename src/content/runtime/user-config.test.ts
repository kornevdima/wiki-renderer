import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { WikiConfigError } from "./config";
import { configFilePath, parseUserConfig, readUserConfig, readUserConfigSync, writeUserConfig, type UserConfig } from "./user-config";

describe("configFilePath (R1)", () => {
  const home = "/home/me";
  it("macOS: Application Support", () => {
    expect(configFilePath({ platform: "darwin", env: {}, homedir: "/Users/me" })).toBe("/Users/me/Library/Application Support/wiki-renderer/config.json");
  });
  it("Linux: XDG_CONFIG_HOME when set, else ~/.config", () => {
    expect(configFilePath({ platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" }, homedir: home })).toBe("/xdg/wiki-renderer/config.json");
    expect(configFilePath({ platform: "linux", env: {}, homedir: home })).toBe("/home/me/.config/wiki-renderer/config.json");
  });
  it("Windows: %APPDATA%", () => {
    expect(configFilePath({ platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, homedir: "C:\\Users\\me" })).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\wiki-renderer\\config.json",
    );
  });
  it("WIKI_RENDERER_CONFIG overrides on every platform", () => {
    for (const platform of ["darwin", "linux", "win32"] as const) {
      expect(configFilePath({ platform, env: { WIKI_RENDERER_CONFIG: "/tmp/x/c.json", XDG_CONFIG_HOME: "/xdg" }, homedir: home })).toBe("/tmp/x/c.json");
    }
  });
});

describe("parseUserConfig (R7)", () => {
  it("reads wikis and printFileTitle, ignores unknown keys, defaults the name from the id", () => {
    expect(parseUserConfig({ wikis: [{ id: "my-notes", root: "~/n", extra: 1 }, { id: "b", name: "B wiki", root: "/b" }], printFileTitle: true, other: 1 }, "f")).toEqual({
      wikis: [
        { id: "my-notes", name: "My Notes", root: "~/n" },
        { id: "b", name: "B wiki", root: "/b" },
      ],
      printFileTitle: true,
    });
  });
  it("an empty object is an empty config", () => {
    expect(parseUserConfig({}, "f")).toEqual({ wikis: [], printFileTitle: false });
  });
  it.each([
    [{ wikis: [{ id: "Bad Id", root: "/x" }] }, "lowercase"],
    [{ wikis: [{ id: "a", root: "/x" }, { id: "a", root: "/y" }] }, "listed twice"],
    [{ wikis: [{ id: "a" }] }, "no root"],
    [{ wikis: "no" }, "must be a list"],
    [{ printFileTitle: "yes" }, "true or false"],
    [[], "JSON object"],
  ])("refuses %j and names the file", (doc, message) => {
    expect(() => parseUserConfig(doc, "/cfg/config.json")).toThrow(WikiConfigError);
    expect(() => parseUserConfig(doc, "/cfg/config.json")).toThrow(message);
    expect(() => parseUserConfig(doc, "/cfg/config.json")).toThrow("/cfg/config.json");
  });
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wr-ucfg-"));
});

describe("readUserConfigSync", () => {
  it("a missing file is the empty config", () => {
    expect(readUserConfigSync(path.join(dir, "none.json"))).toEqual({ wikis: [], printFileTitle: false });
  });
  it("invalid JSON throws a WikiConfigError naming the file", async () => {
    const file = path.join(dir, "c.json");
    await writeFile(file, "{ nope");
    expect(() => readUserConfigSync(file)).toThrow(WikiConfigError);
    expect(() => readUserConfigSync(file)).toThrow(file);
  });
});

describe("writeUserConfig (R9)", () => {
  const config: UserConfig = { wikis: [{ id: "a", name: "A", root: "~/a" }], printFileTitle: true };

  it("writes, reads back equal, creates the folder, leaves no temp file", async () => {
    const file = path.join(dir, "nested", "config.json");
    await writeUserConfig(file, config);
    expect(await readUserConfig(file)).toEqual(config);
    expect((await readFile(file, "utf8")).endsWith("\n")).toBe(true);
    expect(await readdir(path.dirname(file))).toEqual(["config.json"]);
  });

  it("refuses an invalid config and leaves the old file intact", async () => {
    const file = path.join(dir, "config.json");
    await writeUserConfig(file, config);
    const before = await readFile(file, "utf8");
    await expect(writeUserConfig(file, { wikis: [{ id: "BAD", name: "x", root: "/x" }], printFileTitle: false })).rejects.toThrow(WikiConfigError);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("a failed write leaves the old file intact and no temp file", async () => {
    const file = path.join(dir, "config.json");
    await writeUserConfig(file, config);
    const before = await readFile(file, "utf8");
    // A directory where the target must go makes the rename fail after the temp file is written.
    const blocked = path.join(dir, "blocked.json");
    await mkdir(blocked);
    await expect(writeUserConfig(blocked, config)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await readdir(dir)).sort()).toEqual(["blocked.json", "config.json"]);
  });
});
