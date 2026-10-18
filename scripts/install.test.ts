// US-279 R1-R6: install.sh against a local stand-in for GitHub (scripts/lib/release-server.mjs, ports 3320-3329).
// Every run gets its own WIKI_RENDERER_HOME and HOME under the OS temp folder and a built-from-scratch environment, so the
// real ~/.wiki-renderer, rc files and user config are never reachable. No real GitHub URL is requested: the two seams
// WIKI_RENDERER_API_BASE and WIKI_RENDERER_DOWNLOAD_BASE point at the local server.
//
// The archive is a small fake by default (the real launcher, with a stub bin/node that prints the version from package.json),
// so `npm test` needs no build. To run the whole flow on a real archive built by `npm run package`, set
// WR_INSTALL_ARCHIVE=<path to wiki-renderer-<v>-<platform>-<arch>.tar.gz>: it is repacked under the versions the tests use.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { serveReleases } from "./lib/release-server.mjs";

const posix = process.platform === "darwin" || process.platform === "linux";
const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const INSTALL_SH = path.resolve("install.sh");
const DASH = existsSync("/bin/dash") ? "/bin/dash" : null;

let root: string;
let server: Awaited<ReturnType<typeof serveReleases>>;
const state: { latest: string | null; releases: Record<string, Record<string, Buffer | string>> } = { latest: null, releases: {} };

function sh(args: string[], options: { input?: string } = {}) {
  return spawnSync(args[0]!, args.slice(1), { encoding: "utf8", ...options });
}

/** The archive for `version`, as bytes. */
function buildArchive(version: string): Buffer {
  const stage = path.join(root, "stage", version);
  const top = path.join(stage, `wiki-renderer-${version}-${platform}`);
  const real = process.env.WR_INSTALL_ARCHIVE;
  sh(["rm", "-rf", stage]);
  sh(["mkdir", "-p", stage]);
  if (real) {
    const x = sh(["tar", "-xzf", real, "-C", stage]);
    if (x.status !== 0) throw new Error(x.stderr);
    const [extracted] = sh(["ls", stage]).stdout.trim().split("\n");
    if (extracted !== path.basename(top)) sh(["mv", path.join(stage, extracted!), top]);
  } else {
    sh(["mkdir", "-p", path.join(top, "bin")]);
    sh(["cp", path.resolve("scripts/launcher/wiki-renderer"), path.join(top, "wiki-renderer")]);
    // The stub "node": run as `bin/node cli.mjs --version`, prints the version in package.json beside cli.mjs.
    sh(["sh", "-c", `printf '%s\\n' '#!/bin/sh' 'd=$(dirname "$1")' 'sed -n '"'"'s/.*"version": *"\\([^"]*\\)".*/\\1/p'"'"' "$d/package.json"' > '${path.join(top, "bin", "node")}'`]);
    sh(["touch", path.join(top, "cli.mjs")]);
    sh(["chmod", "755", path.join(top, "wiki-renderer"), path.join(top, "bin", "node")]);
    sh(["sh", "-c", `printf '{"name":"wiki-renderer","version":"0.0.0"}\\n' > '${path.join(top, "package.json")}'`]);
  }
  const pkg = path.join(top, "package.json");
  sh(["sed", "-i.bak", `s/"version": *"[^"]*"/"version": "${version}"/`, pkg]);
  sh(["rm", "-f", `${pkg}.bak`]);
  const out = path.join(stage, "archive.tar.gz");
  const packed = spawnSync("tar", ["-czf", out, "-C", stage, path.basename(top)], { env: { ...process.env, COPYFILE_DISABLE: "1" }, encoding: "utf8" });
  if (packed.status !== 0) throw new Error(packed.stderr);
  return spawnSync("cat", [out], { maxBuffer: 1 << 29 }).stdout;
}

function publish(version: string, options: { sums?: (hash: string, name: string) => string; bytes?: (b: Buffer) => Buffer } = {}) {
  const name = `wiki-renderer-${version}-${platform}.tar.gz`;
  const archive = buildArchive(version);
  const served = options.bytes ? options.bytes(archive) : archive;
  const hash = createHash("sha256").update(archive).digest("hex");
  state.releases[version] = { [name]: served, SHA256SUMS: options.sums ? options.sums(hash, name) : `${hash}  ${name}\n` };
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the installer with a built-from-scratch environment: a temp HOME, a temp install home, the two seams, nothing else of ours. */
function install(home: string, options: { shell?: string; env?: Record<string, string>; script?: string } = {}): Promise<Run> {
  const env: Record<string, string> = {
    PATH: `/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: path.join(home, "..", "user"),
    WIKI_RENDERER_HOME: home,
    WIKI_RENDERER_API_BASE: server.apiBase,
    WIKI_RENDERER_DOWNLOAD_BASE: server.downloadBase,
    SHELL: "/bin/zsh",
    ...options.env,
  };
  return new Promise((resolve) => {
    const child = spawn(options.shell ?? "/bin/sh", [options.script ?? INSTALL_SH], { env: env as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

let home: string;
let userDir: string;
let pristine: typeof state.releases;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wr-install-"));
  server = await serveReleases(state);
  state.latest = "0.1.1";
  if (posix) {
    publish("0.1.0");
    publish("0.1.1");
  }
  pristine = { ...state.releases };
}, 240_000);
afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  const dir = await mkdtemp(path.join(root, "run-"));
  home = path.join(dir, "home");
  userDir = path.join(dir, "user");
  await mkdir(userDir);
  state.latest = "0.1.1";
  state.releases = { ...pristine };
  server.requests.length = 0;
});

const version = (dir: string) => sh([path.join(dir, "bin", "wiki-renderer"), "--version"]);
const run = posix ? describe : describe.skip;

run("install.sh on macOS and Linux", { timeout: 120_000 }, () => {
  it("R1: installs the latest into <home>/<version>/, links bin/wiki-renderer, and prints the PATH line only when bin is not on PATH", async () => {
    const first = await install(home);
    expect(first.code, first.stderr).toBe(0);
    expect(existsSync(path.join(home, "0.1.1", "wiki-renderer"))).toBe(true);
    expect(await readlink(path.join(home, "bin", "wiki-renderer"))).toBe(path.join(home, "0.1.1", "wiki-renderer"));
    expect(version(home).stdout.trim()).toBe("0.1.1");
    const lines = first.stdout.trimEnd().split("\n");
    expect(lines.at(-1)).toBe("Installed Wiki Renderer 0.1.1. Run: wiki-renderer");
    expect(first.stdout).toContain(`Downloading Wiki Renderer 0.1.1 for ${platform}...`);
    expect(first.stdout).toContain(`${path.join(home, "bin")} is not on your PATH. To add it:`);
    expect(first.stdout).toContain(`echo 'export PATH="${path.join(home, "bin")}:$PATH"' >> ~/.zshrc`);
    // The latest came from the API; the archive and sums from the release folder.
    expect(server.requests).toEqual(["/api/releases/latest", `/dl/download/v0.1.1/wiki-renderer-0.1.1-${platform}.tar.gz`, "/dl/download/v0.1.1/SHA256SUMS"]);
    // It never edits an rc file or anything else in HOME, and leaves no temp folder.
    expect(await readdir(userDir)).toEqual([]);
    expect((await readdir(home)).sort()).toEqual(["0.1.1", "bin"]);

    const onPath = await install(path.join(home, "..", "home2"), { env: { PATH: `${path.join(home, "..", "home2", "bin")}:/usr/bin:/bin` } });
    expect(onPath.code, onPath.stderr).toBe(0);
    expect(onPath.stdout).not.toContain("PATH");
    expect(onPath.stdout.trimEnd().split("\n").at(-1)).toBe("Installed Wiki Renderer 0.1.1. Run: wiki-renderer");
  });

  it("R1: names the rc file for the person's shell and shows $HOME for the default folder", async () => {
    const cases: Array<[string, string]> = [
      ["/bin/zsh", "~/.zshrc"],
      ["/bin/bash", process.platform === "darwin" ? "~/.bash_profile" : "~/.bashrc"],
      ["/usr/bin/fish", "~/.profile"],
    ];
    for (const [shell, rc] of cases) {
      const res = await install(path.join(home, shell.replace(/\W/g, "")), { env: { SHELL: shell } });
      expect(res.stdout, shell).toContain(`>> ${rc}\n`);
    }
    // No WIKI_RENDERER_HOME: the default is under HOME, shown as $HOME/.wiki-renderer/bin.
    const res = await install(home, { env: { WIKI_RENDERER_HOME: "" } });
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toContain(`echo 'export PATH="$HOME/.wiki-renderer/bin:$PATH"' >> ~/.zshrc`);
    expect(existsSync(path.join(userDir, ".wiki-renderer", "0.1.1", "wiki-renderer"))).toBe(true);
  });

  it("R2: a wrong checksum aborts with one line, installs nothing and leaves the link alone", async () => {
    expect((await install(home, { env: { WIKI_RENDERER_VERSION: "0.1.0" } })).code).toBe(0);
    const before = await readlink(path.join(home, "bin", "wiki-renderer"));
    publish("0.1.1", { sums: (_h, name) => `${"0".repeat(64)}  ${name}\n` });
    const res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr.trimEnd().split("\n")).toEqual([`The download does not match SHA256SUMS (wiki-renderer-0.1.1-${platform}.tar.gz). It was deleted and nothing was installed.`]);
    expect(res.stdout).not.toContain("Installed");
    expect(existsSync(path.join(home, "0.1.1"))).toBe(false);
    expect(await readlink(path.join(home, "bin", "wiki-renderer"))).toBe(before);
    expect((await readdir(home)).sort()).toEqual(["0.1.0", "bin"]);
  });

  it("R2: tampered bytes, a missing sums entry and a missing archive each abort cleanly", async () => {
    publish("0.1.1", { bytes: (b) => Buffer.concat([b, Buffer.from("x")]) });
    let res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("does not match SHA256SUMS");

    publish("0.1.1", { sums: () => `${"a".repeat(64)}  some-other-file.tar.gz\n` });
    res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr.trimEnd()).toBe(`SHA256SUMS has no entry for wiki-renderer-0.1.1-${platform}.tar.gz.`);

    res = await install(home, { env: { WIKI_RENDERER_VERSION: "9.9.9" } });
    expect(res.code).toBe(1);
    // curl -fsSL prints its own reason first; ours is the last line.
    expect(res.stderr.trimEnd().split("\n").at(-1)).toMatch(/^Could not download .*wiki-renderer-9\.9\.9-.*\. Check the version and your connection\.$/);
    expect(await readdir(home)).toEqual([]);
  });

  it("R3: WIKI_RENDERER_VERSION picks a release, with or without v, and the latest API is not asked", async () => {
    for (const chosen of ["0.1.0", "v0.1.0"]) {
      const dir = path.join(home, chosen);
      state.latest = null; // the API would answer 404
      server.requests.length = 0;
      const res = await install(dir, { env: { WIKI_RENDERER_VERSION: chosen } });
      expect(res.code, res.stderr).toBe(0);
      expect(version(dir).stdout.trim()).toBe("0.1.0");
      expect(existsSync(path.join(dir, "0.1.1"))).toBe(false);
      expect(server.requests.some((r) => r.startsWith("/api"))).toBe(false);
    }
  });

  it("R3: a version that is not a version is refused before any download; a failing latest API says how to choose one", async () => {
    for (const bad of ["../x", "1.2", "1.2.3/../../x", "latest"]) {
      server.requests.length = 0;
      const res = await install(home, { env: { WIKI_RENDERER_VERSION: bad } });
      expect(res.code, bad).toBe(1);
      expect(res.stderr.trimEnd(), bad).toBe(`"${bad.replace(/^v/, "")}" is not a version like 1.2.3.`);
      expect(server.requests, bad).toEqual([]);
    }
    state.latest = null;
    const res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Could not read the latest release");
    expect(res.stderr).toContain("WIKI_RENDERER_VERSION=<version>");
  });

  it("R4: a newer version goes beside the old one and the link moves; the same version is a no-op; config and wikis are untouched", async () => {
    const config = path.join(userDir, "config.json");
    const wikiPage = path.join(userDir, "wiki", "page.md");
    await mkdir(path.dirname(wikiPage));
    await writeFile(config, '{"wikis":[{"id":"a","name":"A","root":"/x"}]}\n');
    await writeFile(wikiPage, "# Page\n");
    const configBefore = await readFile(config);
    const pageBefore = await readFile(wikiPage);
    const env = { WIKI_RENDERER_CONFIG: config };

    const first = await install(home, { env: { ...env, WIKI_RENDERER_VERSION: "0.1.0" } });
    expect(first.code, first.stderr).toBe(0);
    expect(version(home).stdout.trim()).toBe("0.1.0");

    const second = await install(home, { env });
    expect(second.code, second.stderr).toBe(0);
    expect((await readdir(home)).sort()).toEqual(["0.1.0", "0.1.1", "bin"]);
    expect(await readlink(path.join(home, "bin", "wiki-renderer"))).toBe(path.join(home, "0.1.1", "wiki-renderer"));
    expect(version(home).stdout.trim()).toBe("0.1.1");
    expect(second.stdout.trimEnd().split("\n").at(-1)).toBe("Installed Wiki Renderer 0.1.1. Run: wiki-renderer");

    server.requests.length = 0;
    const third = await install(home, { env });
    expect(third.code, third.stderr).toBe(0);
    expect(third.stdout.trimEnd().split("\n").at(-1)).toBe("Wiki Renderer 0.1.1 is already installed. Run: wiki-renderer");
    expect(third.stdout).not.toContain("Installed Wiki Renderer");
    expect(third.stdout).not.toContain("Downloading");
    expect(server.requests.filter((r) => r.startsWith("/dl"))).toEqual([]);
    expect(await readlink(path.join(home, "bin", "wiki-renderer"))).toBe(path.join(home, "0.1.1", "wiki-renderer"));

    expect(Buffer.compare(await readFile(config), configBefore)).toBe(0);
    expect(Buffer.compare(await readFile(wikiPage), pageBefore)).toBe(0);
    expect(await readdir(userDir)).toEqual(["config.json", "wiki"]);
  });

  it("R4: going back to an installed older version moves the link back without a download", async () => {
    await install(home, { env: { WIKI_RENDERER_VERSION: "0.1.0" } });
    await install(home);
    server.requests.length = 0;
    const back = await install(home, { env: { WIKI_RENDERER_VERSION: "0.1.0" } });
    expect(back.code, back.stderr).toBe(0);
    expect(version(home).stdout.trim()).toBe("0.1.0");
    expect(server.requests).toEqual([]);
  });

  it("an interrupted install leaves no half folder: a corrupt archive with a matching checksum is refused and cleaned up", async () => {
    const junk = Buffer.from("not a tar file");
    const name = `wiki-renderer-0.1.1-${platform}.tar.gz`;
    state.releases["0.1.1"] = { [name]: junk, SHA256SUMS: `${createHash("sha256").update(junk).digest("hex")}  ${name}\n` };
    const res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Could not unpack");
    expect(await readdir(home)).toEqual([]);
  });

  it("a symlink at bin/wiki-renderer from an earlier install is replaced, not followed", async () => {
    await mkdir(path.join(home, "bin"), { recursive: true });
    const decoy = path.join(userDir, "decoy");
    await writeFile(decoy, "keep");
    await symlink(decoy, path.join(home, "bin", "wiki-renderer"));
    const res = await install(home);
    expect(res.code, res.stderr).toBe(0);
    expect(await readFile(decoy, "utf8")).toBe("keep");
    expect((await lstat(path.join(home, "bin", "wiki-renderer"))).isSymbolicLink()).toBe(true);
    expect(version(home).stdout.trim()).toBe("0.1.1");
  });

  it("a half-delivered script (curl | sh cut short) runs nothing: the first N lines, and cuts inside the last line, install and link nothing", async () => {
    const text = await readFile(INSTALL_SH, "utf8");
    const lines = text.split("\n");
    const cuts = new Set<string>();
    for (const n of [1, 5, 18, 30, 60, 90, 120, 160, 200]) if (n < lines.length - 2) cuts.add(lines.slice(0, n).join("\n") + "\n");
    // Everything up to (not including) the call on the last line, and each prefix of that last line.
    const last = text.trimEnd().lastIndexOf("\n") + 1;
    expect(text.slice(last).trim()).toBe('main "$@"');
    cuts.add(text.slice(0, last));
    // (A cut that leaves exactly `main` is a complete call, and runs the whole install: that is not a partial script.)
    for (let i = 1; i < text.trimEnd().length - last; i += 1) if (text.slice(last, last + i).trim() !== "main") cuts.add(text.slice(0, last + i));
    cuts.add(lines.slice(0, lines.length - 3).join("\n") + "\n");
    for (const partial of cuts) {
      const res = await new Promise<Run>((resolve) => {
        const child = spawn("/bin/sh", [], {
          env: { PATH: "/usr/bin:/bin", HOME: userDir, WIKI_RENDERER_HOME: home, WIKI_RENDERER_API_BASE: server.apiBase, WIKI_RENDERER_DOWNLOAD_BASE: server.downloadBase } as unknown as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d: Buffer) => (stdout += d));
        child.stderr.on("data", (d: Buffer) => (stderr += d));
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        child.stdin.end(partial);
      });
      const tail = partial.slice(-30);
      expect(res.stdout, tail).not.toContain("Installed");
      expect(existsSync(home), tail).toBe(false);
      expect(server.requests, tail).toEqual([]);
    }
    expect(cuts.size).toBeGreaterThan(10);
  });

  it("an existing <home>/<version> that is not a working install is refused with one line, before any download, and left as it was", async () => {
    for (const [version, chosen] of [["0.9.0", "0.9.0"], ["0.1.1", ""]] as const) {
      const dir = path.join(home, "..", `home-${version}`);
      await mkdir(path.join(dir, version), { recursive: true });
      const res = await install(dir, { env: chosen ? { WIKI_RENDERER_VERSION: chosen } : {} });
      expect(res.code, version).toBe(1);
      expect(res.stderr.trimEnd(), version).toBe(`${path.join(dir, version)} exists but is not a Wiki Renderer install. Move it away and run this again.`);
      expect(res.stdout, version).not.toContain("Installed");
      expect(await readdir(path.join(dir, version)), version).toEqual([]);
      expect(existsSync(path.join(dir, "bin")), version).toBe(false);
      expect(server.requests.filter((r) => r.startsWith("/dl")), version).toEqual([]);
    }
    // A plain file of that name is refused the same way.
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, "0.1.1"), "mine");
    const asFile = await install(home);
    expect(asFile.code).toBe(1);
    expect(await readFile(path.join(home, "0.1.1"), "utf8")).toBe("mine");
  });

  it("bin/wiki-renderer: a folder or a file this installer did not make is refused with one line and kept; a link is replaced atomically with no temp left", async () => {
    await mkdir(path.join(home, "bin", "wiki-renderer"), { recursive: true });
    let res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr.trimEnd()).toBe(`${path.join(home, "bin", "wiki-renderer")} is a folder, not the link this installer makes. Move it away and run this again.`);
    expect(await readdir(path.join(home, "bin", "wiki-renderer"))).toEqual([]);
    expect(existsSync(path.join(home, "0.1.1"))).toBe(false);

    await rm(path.join(home, "bin", "wiki-renderer"), { recursive: true });
    await writeFile(path.join(home, "bin", "wiki-renderer"), "my own script");
    res = await install(home);
    expect(res.code).toBe(1);
    expect(res.stderr.trimEnd()).toBe(`${path.join(home, "bin", "wiki-renderer")} is a file this installer did not make. Move it away and run this again.`);
    expect(await readFile(path.join(home, "bin", "wiki-renderer"), "utf8")).toBe("my own script");
    expect(existsSync(path.join(home, "0.1.1"))).toBe(false);

    await rm(path.join(home, "bin", "wiki-renderer"));
    expect((await install(home)).code).toBe(0);
    expect((await install(home, { env: { WIKI_RENDERER_VERSION: "0.1.0" } })).code).toBe(0);
    expect((await readdir(path.join(home, "bin"))).sort()).toEqual(["wiki-renderer"]);
    expect(await readlink(path.join(home, "bin", "wiki-renderer"))).toBe(path.join(home, "0.1.0", "wiki-renderer"));
  });

  it("a version is judged as a whole string: a multi-line value, odd characters and bad shapes are refused before any request", async () => {
    for (const bad of ["0.9.0\nx/../y", "0.1.1\n", "\n0.1.1", "0.1.1 ", "1.2.3.4", "1.2", "1.2-3.4", "1.a.3", "1..3", "1.2.3-", "0.1.1;id", "$(id)", "1.2.3/../x"]) {
      server.requests.length = 0;
      const res = await install(home, { env: { WIKI_RENDERER_VERSION: bad } });
      expect(res.code, JSON.stringify(bad)).toBe(1);
      expect(res.stderr, JSON.stringify(bad)).toContain("is not a version like 1.2.3.");
      expect(server.requests, JSON.stringify(bad)).toEqual([]);
      expect(existsSync(path.join(home, "0.1.1")), JSON.stringify(bad)).toBe(false);
    }
    for (const good of ["0.1.0", "v0.1.0"]) {
      const res = await install(path.join(home, good), { env: { WIKI_RENDERER_VERSION: good } });
      expect(res.code, good).toBe(0);
    }
  });

  it("the PATH hint is safe to paste for a home with spaces, quotes, $ and backticks: pasted, it puts exactly that folder first on PATH", async () => {
    const odd = path.join(home, "..", "it's a \"home\" $x `y` \\z");
    const res = await install(odd);
    expect(res.code, res.stderr).toBe(0);
    const line = res.stdout.split("\n").find((l) => l.startsWith("  echo "));
    expect(line).toBeDefined();
    const rcFile = path.join(userDir, "rc");
    const pasted = sh(["/bin/sh", "-c", line!.replace("~/.zshrc", `'${rcFile}'`)]);
    expect(pasted.status, pasted.stderr).toBe(0);
    const sourced = sh(["/bin/sh", "-c", `PATH=/usr/bin; . '${rcFile}'; printf '%s' "$PATH"`]);
    expect(sourced.stdout).toBe(`${path.join(odd, "bin")}:/usr/bin`);
  });

  it("downloads over https with TLS 1.2 unless the URL is under a test seam that was set, with a stall limit and no total time limit (static)", async () => {
    const text = await readFile(INSTALL_SH, "utf8");
    expect(text).toContain("--proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 15 --speed-limit 1024 --speed-time 60");
    expect(text).not.toContain("--max-time");
    expect(text).toContain("wget -q -T 30");
    expect(text).toContain('if http_allowed "$1"; then');
    expect(text).not.toContain("ALLOW_HTTP");
    expect(text.trimEnd().split("\n").at(-1)).toBe('main "$@"');
  });

  it("decides http per URL: a seam value that is itself https keeps https, and an http URL outside the seams is refused by curl", async () => {
    // Only the API seam is http; the download base is left at its https default, so the archive URL must not be fetched over http.
    const fakeCurl = path.join(path.dirname(home), "curlbin");
    await mkdir(fakeCurl, { recursive: true });
    const log = path.join(fakeCurl, "log");
    await writeFile(path.join(fakeCurl, "curl"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit 22\n`);
    await chmod(path.join(fakeCurl, "curl"), 0o755);
    const tools = ["uname", "mkdir", "mktemp", "rm", "sed", "head", "basename", "cat"];
    for (const t of tools) await symlink(sh(["sh", "-c", `command -v ${t}`]).stdout.trim(), path.join(fakeCurl, t));
    await install(home, { env: { PATH: fakeCurl, WIKI_RENDERER_DOWNLOAD_BASE: "", WIKI_RENDERER_VERSION: "0.1.1" } });
    await install(path.join(home, "api"), { env: { PATH: fakeCurl, WIKI_RENDERER_DOWNLOAD_BASE: "", WIKI_RENDERER_VERSION: "0.1.1" } });
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    expect(calls.length).toBeGreaterThan(0);
    // The download URL (default https base) is fetched with the https-only flags.
    for (const call of calls) expect(call).toContain("--proto =https --proto-redir =https --tlsv1.2");
    // With the download seam set, only URLs under it drop the flags.
    await rm(log);
    await install(path.join(home, "seam"), { env: { PATH: fakeCurl, WIKI_RENDERER_VERSION: "0.1.1" } });
    const seamCalls = (await readFile(log, "utf8")).trim().split("\n");
    expect(seamCalls[0]).toContain(server.downloadBase);
    expect(seamCalls[0]).not.toContain("--proto");
    expect(seamCalls[0]).toContain("--speed-limit 1024 --speed-time 60");
  });

  describe("R5: unsupported machines and missing tools", () => {
    let toolbin: string;
    const TOOLS = ["mkdir", "mktemp", "rm", "tar", "gzip", "sed", "head", "grep", "awk", "basename", "ln", "mv", "shasum", "sha256sum", "curl", "wget", "cat", "uname", "dirname"];
    beforeEach(async () => {
      toolbin = path.join(path.dirname(home), "toolbin");
      await mkdir(toolbin);
      for (const tool of TOOLS) {
        const found = sh(["sh", "-c", `command -v ${tool}`]).stdout.trim();
        if (found && !(await lstat(path.join(toolbin, tool)).catch(() => null))) await symlink(found, path.join(toolbin, tool));
      }
    });
    afterEach(async () => {
      await rm(toolbin, { recursive: true, force: true });
    });

    async function stubUname(os: string, cpu: string) {
      await rm(path.join(toolbin, "uname"), { force: true });
      const file = path.join(toolbin, "uname");
      await writeFile(file, `#!/bin/sh\ncase "$1" in -s) echo '${os}' ;; -m) echo '${cpu}' ;; *) echo '${os}' ;; esac\n`);
      await chmod(file, 0o755);
    }

    it("refuses an OS or CPU with no build in one line naming it", async () => {
      for (const [os_, cpu, expected] of [
        ["FreeBSD", "amd64", "Wiki Renderer has no build for FreeBSD amd64. It runs on macOS and Linux (arm64 or x64) and Windows (x64)."],
        ["Linux", "riscv64", "Wiki Renderer has no build for Linux riscv64. It runs on macOS and Linux (arm64 or x64) and Windows (x64)."],
        ["Darwin", "i386", "Wiki Renderer has no build for Darwin i386. It runs on macOS and Linux (arm64 or x64) and Windows (x64)."],
        ["MINGW64_NT-10.0", "x86_64", "This installer is for macOS and Linux. On Windows, use the PowerShell line in the README."],
      ] as const) {
        await stubUname(os_, cpu);
        const res = await install(home, { env: { PATH: toolbin } });
        expect(res.code, os_).toBe(1);
        expect(res.stderr.trimEnd(), os_).toBe(expected);
        expect(res.stdout, os_).toBe("");
        expect(existsSync(home), os_).toBe(false);
      }
    });

    it("maps the CPU names it supports (arm64 aarch64 x86_64 amd64) to the archive names", async () => {
      for (const [os_, cpu, expected] of [
        ["Linux", "aarch64", "linux-arm64"],
        ["Linux", "x86_64", "linux-x64"],
        ["Darwin", "arm64", "darwin-arm64"],
        ["Darwin", "amd64", "darwin-x64"],
      ] as const) {
        await stubUname(os_, cpu);
        server.requests.length = 0;
        const res = await install(path.join(home, expected), { env: { PATH: toolbin, WIKI_RENDERER_VERSION: "0.4.4" } });
        // No such release is served: the request shows which archive it asked for.
        expect(res.code, expected).toBe(1);
        expect(server.requests, expected).toEqual([`/dl/download/v0.4.4/wiki-renderer-0.4.4-${expected}.tar.gz`]);
      }
    });

    it("says so in one line when there is neither curl nor wget", async () => {
      await rm(path.join(toolbin, "curl"), { force: true });
      await rm(path.join(toolbin, "wget"), { force: true });
      const res = await install(home, { env: { PATH: toolbin } });
      expect(res.code).toBe(1);
      expect(res.stderr.trimEnd()).toBe("Neither curl nor wget is installed. Install one of them and run this again.");
      expect(existsSync(home)).toBe(false);
    });

    it("falls back to wget when there is no curl", async () => {
      const realCurl = await readlink(path.join(toolbin, "curl"));
      await rm(path.join(toolbin, "curl"), { force: true });
      await rm(path.join(toolbin, "wget"), { force: true });
      // A wget that answers the two calls the installer makes: wget -q -T <seconds> -O <file> <url>.
      await writeFile(path.join(toolbin, "wget"), `#!/bin/sh\n[ "$1" = -q ] && [ "$2" = -T ] && [ "$4" = -O ] || exit 2\nexec ${realCurl} -fsSL "$6" -o "$5"\n`);
      await chmod(path.join(toolbin, "wget"), 0o755);
      const res = await install(home, { env: { PATH: toolbin } });
      expect(res.code, res.stderr).toBe(0);
      expect(version(home).stdout.trim()).toBe("0.1.1");
    });

    it("says so when neither shasum nor sha256sum can check the download", async () => {
      await rm(path.join(toolbin, "shasum"), { force: true });
      await rm(path.join(toolbin, "sha256sum"), { force: true });
      const res = await install(home, { env: { PATH: toolbin } });
      expect(res.code).toBe(1);
      expect(res.stderr.trimEnd()).toBe("Neither shasum nor sha256sum is installed, so the download cannot be checked.");
      expect(await readdir(home)).toEqual([]);
    });
  });

  describe("R6: POSIX sh", () => {
    it("parses under /bin/sh and dash (sh -n) and starts with a /bin/sh shebang", async () => {
      const text = await readFile(INSTALL_SH, "utf8");
      expect(text.startsWith("#!/bin/sh\n")).toBe(true);
      expect(text).not.toMatch(/\[\[ |<<<|\$\(\(|\bsource\b|\blocal\b|\bfunction\b|\[ [^\]]*==|\$\{\w+(\/\/|\^\^|,,|\/)|<\(/);
      expect(sh(["/bin/sh", "-n", INSTALL_SH]).status).toBe(0);
      if (DASH) expect(sh([DASH, "-n", INSTALL_SH]).status).toBe(0);
    });

    it.skipIf(!DASH)("installs, updates and refuses under dash too", async () => {
      const first = await install(home, { shell: DASH! });
      expect(first.code, first.stderr).toBe(0);
      expect(version(home).stdout.trim()).toBe("0.1.1");
      expect(first.stdout).toContain("is not on your PATH");
      const again = await install(home, { shell: DASH! });
      expect(again.stdout).toContain("is already installed.");
      const older = await install(home, { shell: DASH!, env: { WIKI_RENDERER_VERSION: "0.1.0" } });
      expect(older.code, older.stderr).toBe(0);
      expect(version(home).stdout.trim()).toBe("0.1.0");
      publish("0.1.1", { sums: (_h, name) => `${"0".repeat(64)}  ${name}\n` });
      const dir = path.join(home, "x");
      const bad = await install(dir, { shell: DASH! });
      expect(bad.code).toBe(1);
      expect(existsSync(path.join(dir, "0.1.1"))).toBe(false);
    });

    it("works when piped to sh, as the one-liner does", async () => {
      const piped = await new Promise<Run>((resolve) => {
        const child = spawn("/bin/sh", [], {
          env: { PATH: "/usr/bin:/bin", HOME: userDir, WIKI_RENDERER_HOME: home, WIKI_RENDERER_API_BASE: server.apiBase, WIKI_RENDERER_DOWNLOAD_BASE: server.downloadBase } as unknown as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d: Buffer) => (stdout += d));
        child.stderr.on("data", (d: Buffer) => (stderr += d));
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        void readFile(INSTALL_SH).then((script) => child.stdin.end(script));
      });
      expect(piped.code, piped.stderr).toBe(0);
      expect(version(home).stdout.trim()).toBe("0.1.1");
    });
  });
});

describe("the installers are plain text a shell or PowerShell 5.1 reads as written", () => {
  it("both files are ASCII only, and install.sh is executable-agnostic (run through sh)", async () => {
    for (const file of ["install.sh", "install.ps1"]) {
      const bytes = await readFile(path.resolve(file));
      expect(bytes.every((b) => b < 128), file).toBe(true);
    }
  });
});
