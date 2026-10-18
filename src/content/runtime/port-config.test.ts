// US-278: the config file's optional `port`, and the Settings change that sets it.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WikiConfigError } from "./config";
import { parseUserConfig, readUserConfig, writeUserConfig } from "./user-config";
import { applyChange, type ChangeContext } from "./wiki-list-edit";

let dir: string;
let configPath: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wr-port-"));
  configPath = path.join(dir, "cfg", "config.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ctx = (over: Partial<ChangeContext> = {}): ChangeContext => ({
  host: "127.0.0.1:4700",
  port: 4700,
  configPath,
  managedByEnv: false,
  maxBytes: 1000,
  home: dir,
  ...over,
});
const stored = async () => JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;

describe("parseUserConfig port", () => {
  it("has no port unless the file says one", () => {
    expect(parseUserConfig({ wikis: [] }, "f")).toEqual({ wikis: [], printFileTitle: false });
    expect(parseUserConfig({ wikis: [], port: null }, "f")).toEqual({ wikis: [], printFileTitle: false });
  });
  it("accepts a whole number from 1024 to 65535", () => {
    expect(parseUserConfig({ port: 1024 }, "f").port).toBe(1024);
    expect(parseUserConfig({ port: 65535 }, "f").port).toBe(65535);
  });
  it("names the file and the rule for anything else", () => {
    for (const bad of [1023, 65536, 4700.5, "4700", true, 0, -1]) {
      expect(() => parseUserConfig({ port: bad }, "/x/config.json"), String(bad)).toThrow(WikiConfigError);
    }
    expect(() => parseUserConfig({ port: 80 }, "/x/config.json")).toThrow(/\/x\/config.json: "port" must be a whole number from 1024 to 65535/);
  });
});

describe("writeUserConfig port", () => {
  it("writes the port when set, leaves the key out when not, and round-trips", async () => {
    await writeUserConfig(configPath, { wikis: [], printFileTitle: false, port: 4750 });
    expect(await stored()).toEqual({ wikis: [], printFileTitle: false, port: 4750 });
    expect((await readUserConfig(configPath)).port).toBe(4750);
    await writeUserConfig(configPath, { wikis: [], printFileTitle: false });
    expect(await stored()).toEqual({ wikis: [], printFileTitle: false });
  });
  it("refuses an out-of-range port and writes nothing", async () => {
    await expect(writeUserConfig(configPath, { wikis: [], printFileTitle: false, port: 80 })).rejects.toThrow(WikiConfigError);
    await expect(readFile(configPath)).rejects.toThrow();
  });
});

describe("applyChange port", () => {
  it("sets the port, keeps the wikis and the print setting, and clears it with null", async () => {
    await writeUserConfig(configPath, { wikis: [{ id: "a", name: "A", root: "/a" }], printFileTitle: true });
    expect(await applyChange({ kind: "port", value: 4800 }, ctx())).toEqual({ ok: true });
    expect(await stored()).toEqual({ wikis: [{ id: "a", name: "A", root: "/a" }], printFileTitle: true, port: 4800 });
    expect(await applyChange({ kind: "port", value: null }, ctx())).toEqual({ ok: true });
    expect(await stored()).toEqual({ wikis: [{ id: "a", name: "A", root: "/a" }], printFileTitle: true });
  });

  it("keeps the port through a later wiki change", async () => {
    await writeUserConfig(configPath, { wikis: [{ id: "a", name: "A", root: "/a" }], printFileTitle: false, port: 4800 });
    await applyChange({ kind: "rename", id: "a", name: "Alpha" }, ctx());
    expect((await stored()).port).toBe(4800);
  });

  it("writes nothing when the value is unchanged", async () => {
    await writeUserConfig(configPath, { wikis: [], printFileTitle: false, port: 4800 });
    const before = await readFile(configPath, "utf8");
    await writeFile(configPath, before.replace("4800", "4800")); // same bytes
    expect(await applyChange({ kind: "port", value: 4800 }, ctx())).toEqual({ ok: true });
    expect(await readFile(configPath, "utf8")).toBe(before);
  });

  it("refuses values outside 1024 to 65535 and non-integers, writing nothing", async () => {
    await writeUserConfig(configPath, { wikis: [], printFileTitle: false });
    const before = await readFile(configPath, "utf8");
    for (const value of [1023, 65536, 0, -1, 4700.5, "4700", undefined]) {
      expect(await applyChange({ kind: "port", value }, ctx()), String(value)).toEqual({ ok: false, reason: "port_invalid" });
    }
    expect(await readFile(configPath, "utf8")).toBe(before);
  });

  it("still checks the Host first, and stays open when WIKI_DIRS manages the list", async () => {
    expect(await applyChange({ kind: "port", value: 4800 }, ctx({ host: "evil.example:4700" }))).toEqual({ ok: false, reason: "forbidden_host" });
    expect(await applyChange({ kind: "port", value: 4800 }, ctx({ managedByEnv: true }))).toEqual({ ok: true });
    expect((await stored()).port).toBe(4800);
    expect(await applyChange({ kind: "printFileTitle", value: true }, ctx({ managedByEnv: true }))).toEqual({ ok: false, reason: "managed_by_env" });
  });

  it("will not overwrite a bad config file", async () => {
    await writeUserConfig(configPath, { wikis: [], printFileTitle: false });
    await writeFile(configPath, "{bad");
    expect(await applyChange({ kind: "port", value: 4800 }, ctx())).toMatchObject({ ok: false, reason: "config_error" });
    expect(await readFile(configPath, "utf8")).toBe("{bad");
  });
});
