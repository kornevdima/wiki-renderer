import { describe, expect, it, vi } from "vitest";

import { parseWikiDirs, resolveFolder, WikiConfigError } from "./config";

describe("parseWikiDirs", () => {
  it("reads id=folder pairs in order, resolving relative folders against cwd and ~ against HOME", () => {
    expect(parseWikiDirs("pm=../pm/wiki, eng=~/eng/wiki", "/repo/wiki-renderer", "/home/me")).toEqual([
      { id: "pm", name: "Pm", root: "/repo/pm/wiki" },
      { id: "eng", name: "Eng", root: "/home/me/eng/wiki" },
    ]);
  });

  it("a bare folder takes its id from the folder name, or from the parent's when the folder is called wiki", () => {
    expect(parseWikiDirs("/x/Team Notes,/x/project-management/wiki", "/", undefined).map((w) => [w.id, w.name])).toEqual([
      ["team-notes", "Team Notes"],
      ["project-management", "Project Management"],
    ]);
  });

  it.each([
    ["", "no wiki folders"],
    [" , ", "no wiki folders"],
    ["Bad Id=/x", "must be lowercase"],
    ["a=/x,a=/y", "listed twice"],
    ["a=", "has no folder"],
  ])("refuses %j", (value, message) => {
    expect(() => parseWikiDirs(value, "/", undefined)).toThrow(WikiConfigError);
    expect(() => parseWikiDirs(value, "/", undefined)).toThrow(message);
  });
});

describe("~ resolution (US-276 R8)", () => {
  it("resolves against os.homedir() when HOME is unset, for wiki roots and BRAND_LOGO's resolveFolder", async () => {
    vi.resetModules();
    vi.stubEnv("HOME", "");
    vi.doMock("node:os", () => ({ default: { homedir: () => "/mock/home" }, homedir: () => "/mock/home" }));
    const mod = await import("./config");
    expect(mod.parseWikiDirs("n=~/notes", "/cwd")[0]!.root).toBe("/mock/home/notes");
    expect(mod.resolveFolder("~", "/cwd")).toBe("/mock/home");
    expect(mod.resolveFolder("~/logo.png", "/cwd")).toBe("/mock/home/logo.png");
    vi.doUnmock("node:os");
    vi.unstubAllEnvs();
  });

  it("leaves other paths on cwd", () => {
    expect(resolveFolder("rel/x", "/cwd", "/h")).toBe("/cwd/rel/x");
    expect(resolveFolder("/abs", "/cwd", "/h")).toBe("/abs");
  });
});
