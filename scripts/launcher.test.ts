// US-278 R2 / R4: the launchers run the Node that ships beside them on cli.mjs and pass every argument through.
// The sh launcher is run for real with a stand-in `bin/node`; the Windows .cmd cannot run here, so it is pinned as text.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const LAUNCHER = path.resolve("scripts/launcher/wiki-renderer");
const CMD = path.resolve("scripts/launcher/wiki-renderer.cmd");

describe("wiki-renderer.cmd (static: Windows cannot run it here)", () => {
  const text = readFileSync(CMD, "utf8");
  const lines = text.split("\r\n").filter((l) => l.trim() !== "");

  it("uses CRLF line endings throughout", () => {
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("runs bin\\node.exe beside the script on cli.mjs beside the script, passing every argument", () => {
    const run = lines.find((l) => /node\.exe/i.test(l));
    expect(run).toBe('"%~dp0bin\\node.exe" "%~dp0cli.mjs" %*');
  });
  it("does not rely on a Node from the PATH and returns the exit code", () => {
    expect(lines.filter((l) => /\bnode\b/i.test(l.replace(/node\.exe/gi, "")))).toEqual([]);
    expect(lines).toContain("exit /b %ERRORLEVEL%");
    expect(lines[0].toLowerCase()).toBe("@echo off");
  });
});

describe.skipIf(process.platform === "win32")("wiki-renderer (sh)", () => {
  let tmp: string;
  let install: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "wr-launch-"));
    install = path.join(tmp, "install dir"); // a space in the path
    mkdirSync(path.join(install, "bin"), { recursive: true });
    copyFileSync(LAUNCHER, path.join(install, "wiki-renderer"));
    chmodSync(path.join(install, "wiki-renderer"), 0o755);
    // A stand-in runtime: prints each argument on its own line, so the test sees exactly what the launcher passed.
    writeFileSync(path.join(install, "bin", "node"), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\nexit 7\n');
    chmodSync(path.join(install, "bin", "node"), 0o755);
    writeFileSync(path.join(install, "cli.mjs"), "");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function run(file: string) {
    try {
      return { code: 0, out: execFileSync(file, ["add", "a folder", "--port", "3310"], { env: { PATH: "/usr/bin:/bin" } as unknown as NodeJS.ProcessEnv, cwd: tmp, encoding: "utf8" }) };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  }
  const expected = (dir: string) => [path.join(dir, "cli.mjs"), "add", "a folder", "--port", "3310", ""].join("\n");

  it("runs bin/node on cli.mjs from the install folder with the arguments intact, and passes the exit code on", () => {
    const r = run(path.join(install, "wiki-renderer"));
    expect(r.out).toBe(expected(install));
    expect(r.code).toBe(7);
  });
  it("finds the same files through a symlink on the PATH", () => {
    mkdirSync(path.join(tmp, "bin-on-path"));
    symlinkSync(path.join(install, "wiki-renderer"), path.join(tmp, "bin-on-path", "wiki-renderer"));
    const r = run(path.join(tmp, "bin-on-path", "wiki-renderer"));
    expect(r.out).toBe(expected(install));
  });
});
