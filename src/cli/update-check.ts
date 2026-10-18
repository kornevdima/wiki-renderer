/**
 * The update notice (US-279). Off unless `WIKI_RENDERER_UPDATE_CHECK=1` or `--check-updates`: with it off nothing here
 * runs, so the app makes no request. When on, `runUpdateCheck` asks the GitHub releases API for the latest tag (a plain
 * GET with a `User-Agent`, nothing about the machine or the wikis), at most once a day (the answer is cached in
 * `update-check.json` beside `config.json`), with a 2 s timeout, after the server is ready. It never throws: offline, a
 * timeout, a 500 or an unreadable cache all end silently.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_API_BASE = "https://api.github.com/repos/kornevdima/wiki-renderer";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const CHECK_TIMEOUT_MS = 2000;

const INSTALL_SH = "curl -fsSL https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.sh | sh";
const INSTALL_PS1 = "irm https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.ps1 | iex";

/** The one-line install command for an OS (`process.platform`). */
export function installLine(platform: string): string {
  return platform === "win32" ? INSTALL_PS1 : INSTALL_SH;
}

/** The notice: one line. */
export function updateNotice(latest: string, current: string, platform: string): string {
  return `Wiki Renderer ${latest} is available (you have ${current}). Update: ${installLine(platform)}`;
}

/** On when the flag is given or the variable is exactly `1`. */
export function isUpdateCheckEnabled(env: Record<string, string | undefined>, flag: boolean): boolean {
  return flag || env.WIKI_RENDERER_UPDATE_CHECK?.trim() === "1";
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

interface Parsed {
  core: [number, number, number];
  pre: string[] | null;
}

function parseVersion(text: string): Parsed | null {
  const match = VERSION.exec(text.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split(".") : null };
}

/** Semver order: negative when `a` is older than `b`; null when either is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    const diff = left.core[i]! - right.core[i]!;
    if (diff !== 0) return diff;
  }
  if (!left.pre && !right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  const length = Math.max(left.pre.length, right.pre.length);
  for (let i = 0; i < length; i += 1) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** The cache file: beside `config.json`. */
export function updateCachePath(configPath: string): string {
  return path.join(path.dirname(configPath), "update-check.json");
}

interface Cache {
  checkedAt: string;
  latest: string;
}

async function readCache(file: string): Promise<Cache | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { checkedAt, latest } = parsed as Record<string, unknown>;
    if (typeof checkedAt !== "string" || typeof latest !== "string" || Number.isNaN(Date.parse(checkedAt)) || !parseVersion(latest)) return null;
    return { checkedAt, latest };
  } catch {
    return null;
  }
}

async function writeCache(file: string, cache: Cache): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(tmp, file);
  } catch {
    // A cache that cannot be written only means asking again next time; do not leave the temp file behind.
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

export interface UpdateCheckOptions {
  /** `isUpdateCheckEnabled(...)`. False returns before anything else runs. */
  enabled: boolean;
  current: string;
  platform: string;
  /** Path of the cache file (`updateCachePath(configPath)`). */
  cachePath: string;
  apiBase?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  out: (line: string) => void;
  timeoutMs?: number;
}

/** Asks the releases API for the latest tag; null on any failure. */
async function fetchLatest(opts: UpdateCheckOptions): Promise<string | null> {
  try {
    const base = (opts.apiBase?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
    const res = await (opts.fetchFn ?? fetch)(`${base}/releases/latest`, {
      method: "GET",
      headers: { "User-Agent": `wiki-renderer/${opts.current}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const tag = typeof body === "object" && body !== null ? (body as { tag_name?: unknown }).tag_name : undefined;
    if (typeof tag !== "string") return null;
    const latest = tag.trim().replace(/^v/, "");
    return parseVersion(latest) ? latest : null;
  } catch {
    return null;
  }
}

/**
 * The whole check: cache first (fresh within 24 h means no request), else one request; prints the notice when the latest
 * release is newer than `current`. A failed request is not cached, so the next start tries again. Never throws.
 */
export async function runUpdateCheck(opts: UpdateCheckOptions): Promise<void> {
  if (!opts.enabled) return;
  try {
    const now = (opts.now ?? Date.now)();
    let latest: string | null = null;
    const cached = await readCache(opts.cachePath);
    if (cached) {
      const age = now - Date.parse(cached.checkedAt);
      if (age >= 0 && age < CHECK_INTERVAL_MS) latest = cached.latest;
    }
    if (latest === null) {
      latest = await fetchLatest(opts);
      if (latest === null) return;
      await writeCache(opts.cachePath, { checkedAt: new Date(now).toISOString(), latest });
    }
    const order = compareVersions(opts.current, latest);
    if (order !== null && order < 0) opts.out(updateNotice(latest, opts.current, opts.platform));
  } catch {
    // Never fails startup.
  }
}
