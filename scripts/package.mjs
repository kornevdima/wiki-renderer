// Packages the portable build (US-278): the Next standalone server, the CLI bundle, the launchers and the Node runtime
// in one archive per platform.
//
//   node scripts/package.mjs <platform> <arch> <nodeDir> [options]
//     platform  darwin | linux | win          arch  arm64 | x64
//     nodeDir   an unpacked official Node distribution (bin/node, or node.exe on win)
//   --root <dir>            the repo with .next/standalone, .next/static, public and build-cli (default: cwd)
//   --out <dir>             where the archive goes (default: <root>/release)
//   --stage <dir>           the staged tree (default: <out>/stage)
//   --stage-only            build the platform-neutral tree and stop (the workflow's build job)
//   --from-stage            skip staging and pack the existing --stage tree (the workflow's package jobs)
//   --expect-version <v>    fail unless the staged package.json says <v> (the release tag)
//
// Staging deletes what must never ship (.env*, src/, tests/), turns the symlinks Turbopack leaves in
// .next/node_modules into real folders (a Windows zip cannot carry them), and fails if any native file (.node, .dll,
// .so, .dylib) is left. The Node binary is added after that check, at bin/node (bin/node.exe on win).
import { createHash } from "node:crypto";
import { chmod, copyFile, cp, mkdir, open, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeTarGz, writeZip } from "./lib/archive.mjs";

export const PLATFORMS = ["darwin", "linux", "win"];
export const ARCHES = ["arm64", "x64"];
/** Root-level folders of the standalone copy that must not ship (tracing pulls them in through dynamic fs paths). */
export const EXCLUDED_ROOT_DIRS = ["src", "tests"];
const NATIVE = /\.(node|dll|dylib|so)$|\.so\.\d/;
/** 2000-01-01 UTC, or SOURCE_DATE_EPOCH. */
export const DEFAULT_MTIME = 946684800;

/** True for a path (POSIX, relative to the install root) that must not be in the archive. */
export function isExcluded(rel) {
  const parts = rel.split("/");
  if (EXCLUDED_ROOT_DIRS.includes(parts[0])) return true;
  const base = parts[parts.length - 1];
  if (parts.length === 1 && base.startsWith(".env")) return true;
  return base === ".DS_Store";
}

export function isNativeFile(rel) {
  return NATIVE.test(rel);
}

/** True when the first bytes of a file are an ELF, Mach-O (thin or fat) or PE (MZ with a "PE\0\0" header) executable or library, whatever the extension. */
export function hasNativeHeader(head) {
  if (head.length < 4) return false;
  const magic = head.readUInt32BE(0);
  if (magic === 0x7f454c46) return true; // ELF
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return true; // Mach-O, fat
  if (head[0] === 0x4d && head[1] === 0x5a && head.length >= 0x40) {
    const at = head.readUInt32LE(0x3c);
    return at + 4 <= head.length && head.toString("latin1", at, at + 4) === "PE\0\0";
  }
  return false;
}

async function readHead(file) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, 1024, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function archiveName(version, platform, arch) {
  return `wiki-renderer-${version}-${platform}-${arch}.${platform === "win" ? "zip" : "tar.gz"}`;
}

/** The unix mode a file gets inside the archive: the launcher and the Node binary run, everything else is 0644. */
export function modeFor(rel) {
  return rel === "wiki-renderer" || rel === "bin/node" ? 0o755 : 0o644;
}

export function nodeBinaryPath(nodeDir, platform) {
  return platform === "win" ? path.join(nodeDir, "node.exe") : path.join(nodeDir, "bin", "node");
}

/** Every file under `dir`, as sorted POSIX relative paths. Follows symlinks (each real folder once per path, no cycles). */
export async function listFiles(dir) {
  const out = [];
  async function walk(abs, rel, seen) {
    const real = await realpath(abs);
    if (seen.has(real)) return;
    const next = new Set(seen).add(real);
    for (const name of await readdir(abs)) {
      const childAbs = path.join(abs, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      const info = await stat(childAbs);
      if (info.isDirectory()) await walk(childAbs, childRel, next);
      else if (info.isFile()) out.push(childRel);
    }
  }
  await walk(dir, "", new Set());
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function exists(p) {
  return stat(p).then(() => true, () => false);
}

/**
 * Builds the platform-neutral tree in `stageDir`: standalone server + .next/static + public + cli.mjs + launchers + LICENSE.
 * Returns the sorted file list. Throws when something that must not ship is present.
 */
export async function stageTree({ root, stageDir }) {
  const standalone = path.join(root, ".next", "standalone");
  const needed = [
    [standalone, "no .next/standalone (run `npm run build` first)"],
    [path.join(root, ".next", "static"), "no .next/static (run `npm run build` first)"],
    [path.join(root, "build-cli", "cli.mjs"), "no build-cli/cli.mjs (run `npm run build:cli` first)"],
  ];
  for (const [p, why] of needed) if (!(await exists(p))) throw new Error(why);

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  const keep = (src) => {
    const rel = path.relative(standalone, src).split(path.sep).join("/");
    return rel === "" || !isExcluded(rel);
  };
  await cp(standalone, stageDir, { recursive: true, dereference: true, filter: keep });
  await cp(path.join(root, ".next", "static"), path.join(stageDir, ".next", "static"), { recursive: true, dereference: true });
  if (await exists(path.join(root, "public"))) await cp(path.join(root, "public"), path.join(stageDir, "public"), { recursive: true });
  await copyFile(path.join(root, "build-cli", "cli.mjs"), path.join(stageDir, "cli.mjs"));
  await copyFile(path.join(root, "scripts", "launcher", "wiki-renderer"), path.join(stageDir, "wiki-renderer"));
  await copyFile(path.join(root, "scripts", "launcher", "wiki-renderer.cmd"), path.join(stageDir, "wiki-renderer.cmd"));
  await copyFile(path.join(root, "LICENSE"), path.join(stageDir, "LICENSE"));
  await chmod(path.join(stageDir, "wiki-renderer"), 0o755);

  const files = await listFiles(stageDir);
  const bad = files.filter((f) => isExcluded(f) || isNativeFile(f));
  for (const rel of files) {
    if (rel.endsWith(".wasm")) continue;
    if (hasNativeHeader(await readHead(path.join(stageDir, ...rel.split("/"))))) bad.push(`${rel} (native executable header)`);
  }
  if (bad.length > 0) throw new Error(`The tree has files that must not ship:\n${bad.slice(0, 10).join("\n")}`);
  for (const must of ["server.js", "package.json", "cli.mjs", "wiki-renderer", "wiki-renderer.cmd"]) {
    if (!files.includes(must)) throw new Error(`The tree is missing ${must}`);
  }
  return files;
}

/** The version in the staged package.json. */
export async function stagedVersion(stageDir) {
  const parsed = JSON.parse(await readFile(path.join(stageDir, "package.json"), "utf8"));
  if (typeof parsed.version !== "string" || parsed.version === "") throw new Error("package.json has no version");
  return parsed.version;
}

/** The archive's entries: the staged files, then the Node binary (and its licence), all under one top folder. */
export function archiveEntries({ stageDir, files, top, nodeFile, nodeLicense, platform }) {
  const entries = files.map((rel) => ({ name: `${top}/${rel}`, file: path.join(stageDir, ...rel.split("/")), mode: modeFor(rel) }));
  const nodeRel = platform === "win" ? "bin/node.exe" : "bin/node";
  entries.push({ name: `${top}/${nodeRel}`, file: nodeFile, mode: modeFor(nodeRel) });
  if (nodeLicense) entries.push({ name: `${top}/licenses/node-LICENSE`, file: nodeLicense, mode: 0o644 });
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function parseCli(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--stage-only" || arg === "--from-stage") options[arg.slice(2)] = true;
    else if (["--root", "--out", "--stage", "--expect-version"].includes(arg)) options[arg.slice(2)] = argv[(i += 1)];
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

export async function main(argv) {
  const { positional, options } = parseCli(argv);
  const root = path.resolve(options.root ?? process.cwd());
  const out = path.resolve(options.out ?? path.join(root, "release"));
  const stageDir = path.resolve(options.stage ?? path.join(out, "stage"));
  const mtime = Number(process.env.SOURCE_DATE_EPOCH ?? DEFAULT_MTIME);

  let files;
  if (options["from-stage"]) files = await listFiles(stageDir);
  else files = await stageTree({ root, stageDir });
  const version = await stagedVersion(stageDir);
  if (options["expect-version"] !== undefined && options["expect-version"] !== version) {
    throw new Error(`package.json says ${version} but the release is ${options["expect-version"]}`);
  }
  if (options["stage-only"]) {
    console.log(`Staged ${files.length} files for ${version} in ${stageDir}`);
    return;
  }

  const [platform, arch, nodeDirArg] = positional;
  if (!PLATFORMS.includes(platform) || !ARCHES.includes(arch) || !nodeDirArg) {
    throw new Error("Usage: node scripts/package.mjs <darwin|linux|win> <arm64|x64> <nodeDir> [--root d] [--out d] [--expect-version v]");
  }
  const nodeDir = path.resolve(nodeDirArg);
  const nodeFile = nodeBinaryPath(nodeDir, platform);
  if (!(await exists(nodeFile))) throw new Error(`No Node binary at ${nodeFile}`);
  const licenseFile = path.join(nodeDir, "LICENSE");

  const top = `wiki-renderer-${version}-${platform}-${arch}`;
  const entries = archiveEntries({
    stageDir,
    files,
    top,
    nodeFile,
    nodeLicense: (await exists(licenseFile)) ? licenseFile : undefined,
    platform,
  });
  await mkdir(out, { recursive: true });
  const archive = path.join(out, archiveName(version, platform, arch));
  await rm(archive, { force: true });
  if (platform === "win") await writeZip(archive, entries, mtime);
  else await writeTarGz(archive, entries, mtime);
  const { size } = await stat(archive);
  console.log(`${archive}\n${size} bytes, ${entries.length} files, sha256 ${await sha256(archive)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
