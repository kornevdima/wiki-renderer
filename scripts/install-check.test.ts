// The release workflow's installer step (scripts/install-check.mjs, US-279 rule 7) on a tiny fake archive. It guards the
// step itself: it once deadlocked because the local server and a blocking spawn shared one process.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installCheck } from "./install-check.mjs";

const posix = process.platform === "darwin" || process.platform === "linux";
const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const tmp = mkdtempSync(path.join(os.tmpdir(), "wr-install-check-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function fakeArchive(version: string, printed: string, bogusExit = 2): string {
  const stage = mkdtempSync(path.join(tmp, "stage-"));
  const top = path.join(stage, `wiki-renderer-${version}-${platform}`);
  mkdirSync(top);
  writeFileSync(path.join(top, "wiki-renderer"), `#!/bin/sh\ncase "$1" in --version) echo ${printed} ;; *) exit ${bogusExit} ;; esac\n`);
  chmodSync(path.join(top, "wiki-renderer"), 0o755);
  const file = path.join(stage, `wiki-renderer-${version}-${platform}.tar.gz`);
  const packed = spawnSync("tar", ["-czf", file, "-C", stage, path.basename(top)], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  if (packed.status !== 0) throw new Error(String(packed.stderr));
  return file;
}

describe.skipIf(!posix)("install-check.mjs", () => {
  it("installs the served archive into a temp home and passes when --version prints the release version", async () => {
    await expect(installCheck({ archive: fakeArchive("1.2.3", "1.2.3"), version: "1.2.3" })).resolves.toBeUndefined();
  }, 30_000);

  it("fails when the installed app reports another version", async () => {
    await expect(installCheck({ archive: fakeArchive("1.2.4", "9.9.9"), version: "1.2.4" })).rejects.toThrow(/printed "9\.9\.9".*expected "1\.2\.4"/);
  }, 30_000);

  it("fails when a usage mistake does not come back as exit code 2 through the shim", async () => {
    await expect(installCheck({ archive: fakeArchive("1.2.7", "1.2.7", 0), version: "1.2.7" })).rejects.toThrow(/--bogus exited 0, expected 2/);
    await expect(installCheck({ archive: fakeArchive("1.2.8", "1.2.8", 1), version: "1.2.8" })).rejects.toThrow(/--bogus exited 1, expected 2/);
  }, 30_000);

  it("refuses an archive whose name is not for that version", async () => {
    await expect(installCheck({ archive: fakeArchive("1.2.5", "1.2.5"), version: "1.2.6" })).rejects.toThrow(/is not a wiki-renderer-1\.2\.6/);
  });
});
