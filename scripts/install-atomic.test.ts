// US-279 R2 / R4 (audit gaps): an install that stops half way leaves the machine as it was.
//   - an update whose archive will not unpack keeps the older version, its folder and the link to it;
//   - an install killed while the archive is still downloading leaves no <home>/<v>/, no link and no temp folder behind.
// Same hygiene as install.test.ts: a temp HOME and WIKI_RENDERER_HOME, the two seams at a local server on 3320-3329.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, readlink, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveReleases } from "./lib/release-server.mjs";

const posix = process.platform === "darwin" || process.platform === "linux";
const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const INSTALL_SH = path.resolve("install.sh");

let root: string;
let server: Awaited<ReturnType<typeof serveReleases>>;
const state: { latest: string | null; releases: Record<string, Record<string, Buffer | string>> } = { latest: null, releases: {} };

/** A tiny but valid archive: the launcher name the installer checks for, printing its version. */
function miniArchive(version: string): Buffer {
  const stage = path.join(root, "stage", version);
  const top = path.join(stage, `wiki-renderer-${version}-${platform}`);
  spawnSync("mkdir", ["-p", top]);
  spawnSync("sh", ["-c", `printf '#!/bin/sh\\necho ${version}\\n' > '${path.join(top, "wiki-renderer")}' && chmod 755 '${path.join(top, "wiki-renderer")}'`]);
  const out = path.join(stage, "a.tar.gz");
  const packed = spawnSync("tar", ["-czf", out, "-C", stage, path.basename(top)], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  if (packed.status !== 0) throw new Error(String(packed.stderr));
  return spawnSync("cat", [out], { maxBuffer: 1 << 26 }).stdout;
}
const sums = (name: string, bytes: Buffer) => `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`;

/** Async on purpose: the release server lives in this process, and spawnSync would block it. */
function runInstall(env: NodeJS.ProcessEnv): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", [INSTALL_SH], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

function installEnv(home: string, apiBase: string, downloadBase: string) {
  return {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: path.join(home, "..", "user"),
    WIKI_RENDERER_HOME: home,
    WIKI_RENDERER_API_BASE: apiBase,
    WIKI_RENDERER_DOWNLOAD_BASE: downloadBase,
    SHELL: "/bin/zsh",
  } as unknown as NodeJS.ProcessEnv;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wr-atomic-"));
  server = await serveReleases(state);
}, 60_000);
afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});

describe.skipIf(!posix)("an install that stops half way", () => {
  it("R4: an update whose archive will not unpack keeps the older version, its folder and its link", async () => {
    const home = path.join(await mkdtemp(path.join(root, "run-")), "home");
    await mkdir(path.join(path.dirname(home), "user"));
    const good = miniArchive("0.1.0");
    const junk = Buffer.from("not a tar file");
    const name = (v: string) => `wiki-renderer-${v}-${platform}.tar.gz`;
    state.latest = "0.1.0";
    state.releases = { "0.1.0": { [name("0.1.0")]: good, SHA256SUMS: sums(name("0.1.0"), good) }, "0.1.1": { [name("0.1.1")]: junk, SHA256SUMS: sums(name("0.1.1"), junk) } };
    const env = installEnv(home, server.apiBase, server.downloadBase);
    const first = await runInstall(env);
    expect(first.status, first.stderr).toBe(0);
    const link = path.join(home, "bin", "wiki-renderer");
    expect(await readlink(link)).toBe(path.join(home, "0.1.0", "wiki-renderer"));
    const before = await readFile(path.join(home, "0.1.0", "wiki-renderer"));

    state.latest = "0.1.1";
    const second = await runInstall(env);
    expect(second.status).toBe(1);
    expect(second.stderr.trim().split("\n").at(-1), second.stderr).toBe("Could not unpack wiki-renderer-0.1.1-" + platform + ".tar.gz."); // tar adds its own line before ours
    expect((await readdir(home)).sort()).toEqual(["0.1.0", "bin"]); // no 0.1.1 folder, no .install-* leftovers
    expect(await readlink(link)).toBe(path.join(home, "0.1.0", "wiki-renderer")); // the link did not move
    expect(Buffer.compare(await readFile(path.join(home, "0.1.0", "wiki-renderer")), before)).toBe(0);
    expect(spawnSync(link, ["--version"], { encoding: "utf8" }).stdout.trim()).toBe("0.1.0");
  });

  it("R2: an install interrupted with Ctrl+C (SIGINT to its process group) while the archive is still downloading leaves no version folder, no link and no temp folder", async () => {
    const home = path.join(await mkdtemp(path.join(root, "run-")), "home");
    await mkdir(path.join(path.dirname(home), "user"));
    const name = `wiki-renderer-0.2.0-${platform}.tar.gz`;
    const bytes = Buffer.alloc(1 << 20, 1);
    let asked: () => void = () => undefined;
    const archiveAsked = new Promise<void>((resolve) => (asked = resolve));
    // A server that sends the archive's headers and then stalls: the installer is "downloading" for as long as we like.
    const stall = http.createServer((req, res) => {
      if (req.url?.endsWith(name)) {
        res.writeHead(200, { "content-length": bytes.length });
        res.write(bytes.subarray(0, 1000));
        asked();
        return; // never ends
      }
      res.writeHead(404).end();
    });
    const port = await new Promise<number>((resolve, reject) => {
      let p = 3325;
      const attempt = () => {
        stall.once("error", (e: NodeJS.ErrnoException) => (e.code === "EADDRINUSE" && p < 3329 ? (p += 1, attempt()) : reject(e)));
        stall.listen(p, "127.0.0.1", () => resolve(p));
      };
      attempt();
    });
    try {
      const child = spawn("/bin/sh", [INSTALL_SH], { env: { ...installEnv(home, `http://127.0.0.1:${port}/api`, `http://127.0.0.1:${port}/dl`), WIKI_RENDERER_VERSION: "0.2.0" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
      const closed = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
      await archiveAsked;
      expect((await readdir(home)).some((e) => e.startsWith(".install-"))).toBe(true); // control: the temp folder exists mid-download
      // What a terminal does on Ctrl+C: the signal goes to the whole foreground group (sh and its curl). A SIGTERM sent to sh alone
      // is only handled once the foreground curl ends, so a stalled download outlives it (reported, not asserted).
      process.kill(-child.pid!, "SIGINT");
      expect(await closed).not.toBe(0);
      expect(await readdir(home)).toEqual([]);
    } finally {
      stall.closeAllConnections();
      await new Promise((resolve) => stall.close(resolve));
    }
  });
});
