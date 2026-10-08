import { describe, expect, it } from "vitest";

import { parseWikiDirs, WikiConfigError } from "./config";

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
    ["a=~/x", "HOME is not set"],
  ])("refuses %j", (value, message) => {
    expect(() => parseWikiDirs(value, "/", undefined)).toThrow(WikiConfigError);
    expect(() => parseWikiDirs(value, "/", undefined)).toThrow(message);
  });
});
