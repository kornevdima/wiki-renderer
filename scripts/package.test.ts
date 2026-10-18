import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeTarGz, writeZip, splitTarName, tarHeader } from "./lib/archive.mjs";
import {
  archiveEntries,
  archiveName,
  hasNativeHeader,
  isExcluded,
  isNativeFile,
  listFiles,
  modeFor,
  nodeBinaryPath,
  stageTree,
  stagedVersion,
} from "./package.mjs";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "wr-pack-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function put(rel: string, text = "x") {
  const file = path.join(tmp, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

describe("isExcluded", () => {
  it("drops src, tests, root .env files and .DS_Store, nothing else", () => {
    for (const rel of ["src/content/runtime/index.ts", "tests/fixtures/sample-wiki/assets/diagram.svg", ".env", ".env.local", ".env.production", "node_modules/x/.DS_Store"]) {
      expect(isExcluded(rel), rel).toBe(true);
    }
    for (const rel of ["server.js", "package.json", ".next/server/app/page.js", "node_modules/pkg/src/index.js", "node_modules/pkg/.env.example", "public/logo.svg", "cli.mjs"]) {
      expect(isExcluded(rel), rel).toBe(false);
    }
  });
});

describe("isNativeFile", () => {
  it("matches .node, .dll, .so, .dylib and versioned .so, not wasm or node", () => {
    for (const rel of ["a/sharp.node", "libvips.dylib", "x.dll", "y.so", "libz.so.1"]) expect(isNativeFile(rel), rel).toBe(true);
    for (const rel of ["bin/node", "wasm-inlined.mjs", "a.wasm", "nodemon.js", "so.json", "bin/node.exe"]) expect(isNativeFile(rel), rel).toBe(false);
  });
});

describe("hasNativeHeader", () => {
  const pe = Buffer.alloc(256);
  pe.write("MZ", 0);
  pe.writeUInt32LE(0x80, 0x3c);
  pe.write("PE\0\0", 0x80, "latin1");

  it("recognises ELF, Mach-O thin and fat, and PE by their headers", () => {
    expect(hasNativeHeader(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]))).toBe(true);
    expect(hasNativeHeader(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 7, 0]))).toBe(true);
    expect(hasNativeHeader(Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0, 0]))).toBe(true);
    expect(hasNativeHeader(Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0]))).toBe(true);
    expect(hasNativeHeader(pe)).toBe(true);
  });
  it("leaves scripts, JSON, wasm and a text file that merely starts with MZ alone", () => {
    expect(hasNativeHeader(Buffer.from("#!/bin/sh\n"))).toBe(false);
    expect(hasNativeHeader(Buffer.from('{"a":1}'))).toBe(false);
    expect(hasNativeHeader(Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]))).toBe(false);
    expect(hasNativeHeader(Buffer.from("MZ is a text file ".padEnd(200, "x")))).toBe(false);
    expect(hasNativeHeader(Buffer.alloc(2))).toBe(false);
  });
});

describe("names and modes", () => {
  it("names archives as the story lists them", () => {
    expect(archiveName("0.2.0", "darwin", "arm64")).toBe("wiki-renderer-0.2.0-darwin-arm64.tar.gz");
    expect(archiveName("0.2.0", "linux", "x64")).toBe("wiki-renderer-0.2.0-linux-x64.tar.gz");
    expect(archiveName("0.2.0", "win", "x64")).toBe("wiki-renderer-0.2.0-win-x64.zip");
  });
  it("makes only the launcher and the node binary executable", () => {
    expect(modeFor("wiki-renderer")).toBe(0o755);
    expect(modeFor("bin/node")).toBe(0o755);
    expect(modeFor("server.js")).toBe(0o644);
    expect(modeFor("wiki-renderer.cmd")).toBe(0o644);
  });
  it("finds the node binary per platform", () => {
    expect(nodeBinaryPath("/n", "linux")).toBe(path.join("/n", "bin", "node"));
    expect(nodeBinaryPath("/n", "win")).toBe(path.join("/n", "node.exe"));
  });
});

describe("listFiles", () => {
  it("lists sorted POSIX paths and follows symlinked folders as real ones", async () => {
    await put("node_modules/pino/index.js");
    await put("b.txt");
    await put("a.txt");
    await mkdir(path.join(tmp, ".next", "node_modules"), { recursive: true });
    await symlink(path.join("..", "..", "node_modules", "pino"), path.join(tmp, ".next", "node_modules", "pino-abc"));
    expect(await listFiles(tmp)).toEqual(["a.txt", "b.txt", "node_modules/pino/index.js", ".next/node_modules/pino-abc/index.js"].sort());
  });
  it("does not loop on a symlink cycle", async () => {
    await put("d/f.txt");
    await symlink("..", path.join(tmp, "d", "up"));
    expect(await listFiles(tmp)).toEqual(["d/f.txt"]);
  });
});

describe("stageTree", () => {
  async function fakeBuild(extra: Record<string, string> = {}) {
    const files: Record<string, string> = {
      ".next/standalone/server.js": "server",
      ".next/standalone/package.json": JSON.stringify({ name: "wiki-renderer", version: "9.8.7" }),
      ".next/standalone/.env": "SECRET=1",
      ".next/standalone/.env.local": "SECRET=2",
      ".next/standalone/src/content/runtime/index.ts": "src",
      ".next/standalone/tests/fixtures/x.svg": "svg",
      ".next/standalone/.next/server/page.js": "page",
      ".next/standalone/node_modules/pino/index.js": "pino",
      ".next/static/chunks/a.js": "chunk",
      "public/logo.svg": "logo",
      "build-cli/cli.mjs": "cli",
      "scripts/launcher/wiki-renderer": "#!/bin/sh\n",
      "scripts/launcher/wiki-renderer.cmd": "@echo off\r\n",
      LICENSE: "MIT",
      ...extra,
    };
    for (const [rel, text] of Object.entries(files)) await put(rel, text);
    await mkdir(path.join(tmp, ".next", "standalone", ".next", "node_modules"), { recursive: true });
    await symlink(path.join("..", "..", "node_modules", "pino"), path.join(tmp, ".next", "standalone", ".next", "node_modules", "pino-abc"));
  }

  it("keeps the server, static files, public, cli and launchers; drops .env, src and tests; turns symlinks into folders", async () => {
    await fakeBuild();
    const stage = path.join(tmp, "release", "stage");
    const files = await stageTree({ root: tmp, stageDir: stage });
    expect(files).toEqual(
      [
        ".next/node_modules/pino-abc/index.js",
        ".next/server/page.js",
        ".next/static/chunks/a.js",
        "LICENSE",
        "cli.mjs",
        "node_modules/pino/index.js",
        "package.json",
        "public/logo.svg",
        "server.js",
        "wiki-renderer",
        "wiki-renderer.cmd",
      ].sort(),
    );
    expect((await stat(path.join(stage, ".next", "node_modules", "pino-abc"))).isDirectory()).toBe(true);
    expect(await stagedVersion(stage)).toBe("9.8.7");
  });

  it("fails when a native file is in the tree", async () => {
    await fakeBuild({ ".next/standalone/node_modules/sharp/build/sharp.node": "elf" });
    await expect(stageTree({ root: tmp, stageDir: path.join(tmp, "stage") })).rejects.toThrow(/must not ship[\s\S]*sharp\.node/);
  });

  it("fails on a native executable with an innocent name", async () => {
    await fakeBuild();
    await writeFile(path.join(tmp, ".next", "standalone", "node_modules", "helper"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
    await expect(stageTree({ root: tmp, stageDir: path.join(tmp, "stage") })).rejects.toThrow(/node_modules\/helper \(native executable header\)/);
  });

  it("says what to run first when the build is missing", async () => {
    await expect(stageTree({ root: tmp, stageDir: path.join(tmp, "stage") })).rejects.toThrow(/npm run build/);
  });
});

describe("archiveEntries", () => {
  it("puts everything under one folder, adds the node binary and its licence, and sorts", () => {
    const entries = archiveEntries({
      stageDir: "/stage",
      files: ["wiki-renderer", "server.js"],
      top: "wiki-renderer-1.0.0-linux-x64",
      nodeFile: "/n/bin/node",
      nodeLicense: "/n/LICENSE",
      platform: "linux",
    });
    expect(entries.map((e: { name: string; mode: number }) => [e.name, e.mode])).toEqual([
      ["wiki-renderer-1.0.0-linux-x64/bin/node", 0o755],
      ["wiki-renderer-1.0.0-linux-x64/licenses/node-LICENSE", 0o644],
      ["wiki-renderer-1.0.0-linux-x64/server.js", 0o644],
      ["wiki-renderer-1.0.0-linux-x64/wiki-renderer", 0o755],
    ]);
  });
  it("names the Windows binary bin/node.exe", () => {
    const entries = archiveEntries({ stageDir: "/s", files: [], top: "t", nodeFile: "/n/node.exe", nodeLicense: undefined, platform: "win" });
    expect(entries.map((e: { name: string }) => e.name)).toEqual(["t/bin/node.exe"]);
  });
});

describe("tar and zip writers", () => {
  async function entriesOn(disk: Record<string, string>) {
    const out = [];
    for (const [name, text] of Object.entries(disk)) {
      await put(`src-files/${name}`, text);
      out.push({ name: `top/${name}`, file: path.join(tmp, "src-files", name), mode: name === "run" ? 0o755 : 0o644 });
    }
    return out;
  }

  it("writes a tar.gz whose headers carry names, modes and sizes, and is the same bytes twice", async () => {
    const entries = await entriesOn({ run: "#!/bin/sh\n", "data.txt": "hello" });
    const a = path.join(tmp, "a.tar.gz");
    const b = path.join(tmp, "b.tar.gz");
    await writeTarGz(a, entries, 946684800);
    await writeTarGz(b, entries, 946684800);
    expect((await readFile(a)).equals(await readFile(b))).toBe(true);

    const tar = zlib.gunzipSync(await readFile(a));
    const seen: Array<[string, number, number, string]> = [];
    for (let at = 0; at + 512 <= tar.length && tar[at] !== 0; ) {
      const name = tar.subarray(at, at + 100).toString().replace(/\0.*$/, "");
      const mode = parseInt(tar.subarray(at + 100, at + 108).toString(), 8);
      const size = parseInt(tar.subarray(at + 124, at + 136).toString(), 8);
      seen.push([name, mode, size, tar.subarray(at + 512, at + 512 + size).toString()]);
      at += 512 + Math.ceil(size / 512) * 512;
    }
    expect(seen).toEqual([
      ["top/run", 0o755, 10, "#!/bin/sh\n"],
      ["top/data.txt", 0o644, 5, "hello"],
    ]);
  });

  it("checksums tar headers and splits a long path on a slash", () => {
    const header = tarHeader({ name: "a/b.txt", size: 3, mode: 0o644, mtime: 0 });
    const stored = parseInt(header.subarray(148, 154).toString(), 8);
    const copy = Buffer.from(header);
    copy.write("        ", 148, 8);
    expect(copy.reduce((s, b) => s + b, 0)).toBe(stored);

    const long = `top/${"d".repeat(60)}/${"e".repeat(60)}/file.js`;
    const { prefix, name } = splitTarName(long);
    expect(`${prefix}/${name}`).toBe(long);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(() => splitTarName("x".repeat(300))).toThrow(/too long/);
  });

  it("writes a zip with a central directory that lists every file with its CRC", async () => {
    const entries = await entriesOn({ "a.txt": "hello hello hello hello", "b.txt": "b" });
    const file = path.join(tmp, "x.zip");
    await writeZip(file, entries, 946684800);
    const zip = await readFile(file);
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    let at = zip.readUInt32LE(end + 16);
    const names: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      expect(zip.readUInt32LE(at)).toBe(0x02014b50);
      const method = zip.readUInt16LE(at + 10);
      const crc = zip.readUInt32LE(at + 16);
      const packed = zip.readUInt32LE(at + 20);
      const nameLength = zip.readUInt16LE(at + 28);
      const local = zip.readUInt32LE(at + 42);
      const name = zip.subarray(at + 46, at + 46 + nameLength).toString();
      names.push(name);
      const data = zip.subarray(local + 30 + zip.readUInt16LE(local + 26), local + 30 + zip.readUInt16LE(local + 26) + packed);
      const text = method === 8 ? zlib.inflateRawSync(data) : data;
      expect(zlib.crc32(text)).toBe(crc);
      expect(text.toString()).toBe(name === "top/a.txt" ? "hello hello hello hello" : "b");
      at += 46 + nameLength;
    }
    expect(names).toEqual(["top/a.txt", "top/b.txt"]);
  });
});
