// Fetching and unpacking the Node runtime and our own archives (US-278), shared by `ci-tools.mjs`.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `node-v24.22.0-darwin-arm64.tar.gz` / `node-v24.22.0-win-x64.zip`: the file name nodejs.org uses. */
export function nodeDistName(version, platform, arch) {
  return `node-v${version}-${platform}-${arch}.${platform === "win" ? "zip" : "tar.gz"}`;
}

/** The expected sha256 of `fileName` from a SHASUMS256.txt body ("<hex>  <name>" per line), or null. */
export function expectedSha(shasums, fileName) {
  for (const line of shasums.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (match && match[2] === fileName) return match[1];
  }
  return null;
}

export function sha256Of(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Unpacks a .tar.gz or .zip into `destDir` with the platform's own tool (tar, or PowerShell for a zip on Windows). */
export function extractArchive(file, destDir) {
  const isZip = file.endsWith(".zip");
  const result =
    isZip && process.platform === "win32"
      ? spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${file}' -DestinationPath '${destDir}' -Force`], { stdio: "inherit" })
      : spawnSync("tar", ["-xf", file, "-C", destDir], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Could not unpack ${file}`);
}

/** The sha256 table committed next to the scripts: Node version -> `<platform>-<arch>` -> hash, updated in the PR that bumps the version. */
export const COMMITTED_SHA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node-sha256.json");

export function committedSha(table, version, platform, arch) {
  return table?.[version]?.sha256?.[`${platform}-${arch}`] ?? null;
}

/**
 * Downloads Node `version` for the platform from nodejs.org and unpacks it into `destDir`; returns the unpacked folder.
 * The download must match the sha256 committed in the repo (so a compromised origin cannot change it) and the origin's own
 * SHASUMS256.txt must agree with the committed value too.
 */
export async function fetchNodeChecked(opts) {
  const table = JSON.parse(await readFile(COMMITTED_SHA_FILE, "utf8"));
  const committed = committedSha(table, opts.version, opts.platform, opts.arch);
  if (!committed) throw new Error(`No committed sha256 for Node ${opts.version} ${opts.platform}-${opts.arch} in scripts/node-sha256.json`);
  return fetchNode({ ...opts, committed });
}

/** Downloads Node `version` for the platform from nodejs.org, checks it against SHASUMS256.txt, unpacks it into `destDir`. Returns the unpacked folder. */
export async function fetchNode({ version, platform, arch, destDir, committed, base = "https://nodejs.org/dist" }) {
  const name = nodeDistName(version, platform, arch);
  const shasums = await (await fetchOk(`${base}/v${version}/SHASUMS256.txt`)).text();
  const expected = expectedSha(shasums, name);
  if (!expected) throw new Error(`${name} is not in SHASUMS256.txt`);
  if (committed !== undefined && committed !== expected) {
    throw new Error(`${name}: SHASUMS256.txt says ${expected} but the repo commits ${committed}`);
  }
  const body = Buffer.from(await (await fetchOk(`${base}/v${version}/${name}`)).arrayBuffer());
  const actual = sha256Of(body);
  if (actual !== expected) throw new Error(`${name}: sha256 ${actual} does not match ${committed === undefined ? "SHASUMS256.txt" : "the committed value"} (${expected})`);
  await mkdir(destDir, { recursive: true });
  const file = path.join(destDir, name);
  await writeFile(file, body);
  extractArchive(file, destDir);
  return path.join(destDir, name.replace(/\.(tar\.gz|zip)$/, ""));
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
}
