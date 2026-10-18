import { describe, expect, it, vi } from "vitest";

import { openBrowser, openerCommand, type SpawnFn } from "./open-browser";

const URL = "http://127.0.0.1:3000";

describe("openerCommand", () => {
  it("picks the opener for each platform", () => {
    expect(openerCommand("darwin", URL)).toEqual({ command: "open", args: [URL] });
    expect(openerCommand("linux", URL)).toEqual({ command: "xdg-open", args: [URL] });
    expect(openerCommand("win32", URL)).toEqual({ command: "cmd", args: ["/c", "start", "", URL] });
  });
});

describe("openBrowser", () => {
  const fake = () => {
    const child = { on: vi.fn(), unref: vi.fn() };
    const spawn = vi.fn<SpawnFn>(() => child);
    return { child, spawn };
  };

  it("spawns the platform's opener detached and lets it go", () => {
    const { child, spawn } = fake();
    expect(openBrowser(URL, "darwin", spawn)).toBe(true);
    expect(spawn).toHaveBeenCalledWith("open", [URL], { stdio: "ignore", detached: true });
    expect(child.unref).toHaveBeenCalled();
  });

  it("never throws when the opener is missing", () => {
    const spawn: SpawnFn = () => {
      throw new Error("ENOENT");
    };
    expect(openBrowser(URL, "linux", spawn)).toBe(false);
  });
});
