import "server-only";

import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { dropRenderedForWiki, dropStaleRenderedForWiki } from "@/content/render/render-cache";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

import { build } from "./build";
import { inFlightStore, snapshotCacheStore } from "./cache";
import { parseWikiDirs, resolveFolder, type LocalWiki } from "./config";
import { createLocalSource } from "./local-source";
import { configFilePath, readUserConfigSync, type StoredWiki } from "./user-config";
import type { SnapshotResult, WikiSnapshot } from "./types";

/**
 * `content/runtime`'s public surface. Every configured wiki is a folder on disk. The list comes from `WIKI_DIRS` when
 * that is set (managed by the environment, parsed once, a bad value exits at startup), else from the user's config file
 * (`user-config.ts`), which is re-read when its mtime changes, checked at most once per `WIKI_RECHECK_MS`. A bad file
 * keeps the last good list and exposes the error. `getSnapshot` re-checks the folder's fingerprint at most once per
 * `WIKI_RECHECK_MS` and rebuilds when it changed, so an edit in the vault shows on the next request after that window.
 * Concurrent requests for one revision share one build.
 */
export type { LocalWiki };

export interface WikiList {
  wikis: readonly LocalWiki[];
  /** Where the list came from: `WIKI_DIRS` ("env") or the config file ("file"). */
  source: "env" | "file";
  /** True when `WIKI_DIRS` is set: the file's wikis are ignored and Settings shows the list read-only. */
  managedByEnv: boolean;
  /** The config file's path (read when `source` is "file"). */
  configPath: string;
  /** The config file's problem, when it is bad; `wikis` is then the last good list. Never set for "env". */
  error?: string;
}

interface ConfigState {
  lastCheckedAt: number;
  /** `mtimeMs:size` of the file, or "missing". */
  signature: string;
  wikis: LocalWiki[];
  printFileTitle: boolean;
  error?: string;
}

interface Slots {
  env?: LocalWiki[];
  file?: ConfigState;
}

// On `globalThis` like the caches: instrumentation, pages and routes may load separate copies of this module.
const SLOT = Symbol.for("wiki-renderer.content-runtime.configState");
function slots(): Slots {
  const g = globalThis as { [SLOT]?: Slots };
  return (g[SLOT] ??= {});
}

/** Test-only: forgets the parsed list and the file state (not the snapshot caches). */
export function resetWikiListForTests(): void {
  delete (globalThis as { [SLOT]?: Slots })[SLOT];
}

/** Makes the next `listWikis()` re-read the config file at once (after a write by this process). */
export function invalidateWikiList(): void {
  const file = slots().file;
  if (file) file.lastCheckedAt = -Infinity;
}

function envWikis(value: string): LocalWiki[] {
  const state = slots();
  return (state.env ??= parseWikiDirs(value, process.cwd(), os.homedir()));
}

function fileSignature(file: string): string {
  try {
    const info = statSync(file);
    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return "missing";
  }
}

function resolveStored(stored: readonly StoredWiki[], file: string): LocalWiki[] {
  const home = os.homedir();
  // A relative root in the file resolves against the file's own folder, never the server's working directory.
  return stored.map((w) => ({ id: w.id, name: w.name, root: resolveFolder(w.root, path.dirname(file), home) }));
}

/** Drops a wiki's snapshot and rendered pages (it left the list, or points at another folder now). */
function dropWikiCaches(wikiId: string): void {
  snapshotCacheStore().delete(wikiId);
  dropRenderedForWiki(wikiId);
}

function fileState(file: string): ConfigState {
  const state = slots();
  const now = Date.now();
  const prev = state.file;
  if (prev && now - prev.lastCheckedAt < env.WIKI_RECHECK_MS) return prev;
  const signature = fileSignature(file);
  if (prev && prev.signature === signature) {
    prev.lastCheckedAt = now;
    return prev;
  }
  let next: ConfigState;
  try {
    const config = readUserConfigSync(file);
    next = { lastCheckedAt: now, signature, wikis: resolveStored(config.wikis, file), printFileTitle: config.printFileTitle };
  } catch (error) {
    // Keep the last good list; the first read of a bad file has none, so the list is empty.
    next = {
      lastCheckedAt: now,
      signature,
      wikis: prev?.wikis ?? [],
      printFileTitle: prev?.printFileTitle ?? false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (prev) {
    for (const old of prev.wikis) {
      const kept = next.wikis.find((w) => w.id === old.id);
      if (!kept || kept.root !== old.root) dropWikiCaches(old.id);
    }
  }
  state.file = next;
  return next;
}

export function getWikiList(): WikiList {
  const configPath = configFilePath();
  if (env.WIKI_DIRS !== undefined) {
    return { wikis: envWikis(env.WIKI_DIRS), source: "env", managedByEnv: true, configPath };
  }
  const file = fileState(configPath);
  return { wikis: file.wikis, source: "file", managedByEnv: false, configPath, ...(file.error === undefined ? {} : { error: file.error }) };
}

export function listWikis(): readonly LocalWiki[] {
  return getWikiList().wikis;
}

export function findWiki(wikiId: string): LocalWiki | undefined {
  return listWikis().find((w) => w.id === wikiId);
}

/**
 * Whether the injected file-name heading and the page meta line print (US-284): `WIKI_PRINT_FILE_TITLE` when set, else the config file's
 * `printFileTitle`. `WIKI_DIRS` does not change this: only the wiki list is env-managed.
 */
export function printFileTitle(): boolean {
  if (env.WIKI_PRINT_FILE_TITLE !== undefined) return env.WIKI_PRINT_FILE_TITLE;
  return fileState(configFilePath()).printFileTitle;
}

async function buildOnce(wiki: LocalWiki, sha: string): Promise<WikiSnapshot> {
  const key = `${wiki.id}:${sha}`;
  const inFlight = inFlightStore();
  const existing = inFlight.get(key);
  if (existing) return existing;
  const started = Date.now();
  const promise = build(wiki.id, sha, createLocalSource(wiki.root, env.WIKI_MAX_BYTES))
    .then((snapshot) => {
      log.child({ wikiId: wiki.id }).info("runtime.built", { pages: snapshot.pages.size, ms: Date.now() - started });
      return snapshot;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function getSnapshot(wikiId: string): Promise<SnapshotResult> {
  const wiki = findWiki(wikiId);
  if (!wiki) return { state: "not_connected" };
  const cache = snapshotCacheStore();
  const cached = cache.get(wikiId);
  const now = Date.now();
  if (cached && now - cached.lastCheckedAt < env.WIKI_RECHECK_MS) return { state: "fresh", snapshot: cached.snapshot };
  try {
    const sha = await createLocalSource(wiki.root, env.WIKI_MAX_BYTES).getLatestSha();
    if (cached && cached.sha === sha) {
      cached.lastCheckedAt = now;
      return { state: "fresh", snapshot: cached.snapshot };
    }
    const snapshot = await buildOnce(wiki, sha);
    // The wiki may have left the list, or moved folder, while it built: serve this answer but cache nothing.
    if (findWiki(wikiId)?.root !== wiki.root) return { state: "fresh", snapshot };
    cache.set(wikiId, { snapshot, sha: snapshot.sha, lastCheckedAt: now });
    dropStaleRenderedForWiki(wikiId, snapshot.sha);
    return { state: "fresh", snapshot };
  } catch (error) {
    log.child({ wikiId }).error("runtime.build_failed", { error });
    // A folder that was readable before keeps serving its last good snapshot.
    if (cached) return { state: "stale", snapshot: cached.snapshot, staleSince: new Date(cached.lastCheckedAt) };
    return { state: "unavailable" };
  }
}

/** After a save: the next request re-fingerprints the folder at once instead of after `WIKI_RECHECK_MS`. */
export function invalidateSnapshot(wikiId: string): void {
  const cached = snapshotCacheStore().get(wikiId);
  if (cached) cached.lastCheckedAt = 0;
}

/**
 * `src/instrumentation.ts`'s startup check: logs one line per wiki. A bad `WIKI_DIRS` exits non-zero (the developer
 * override keeps its fail-fast). A missing or bad config file never exits: the home page names the problem. Kept here,
 * behind that file's dynamic import, so `process.exit` never reaches the Edge bundle.
 */
export function assertWikisOrExit(): void {
  try {
    const list = getWikiList();
    for (const wiki of list.wikis) log.child({ wikiId: wiki.id }).info("startup.wiki", { root: wiki.root, source: list.source });
    if (list.error) log.warn("startup.config_invalid", { file: list.configPath, error: list.error });
    else if (list.source === "file" && list.wikis.length === 0) log.info("startup.no_wikis", { file: list.configPath });
  } catch (error) {
    console.error(
      JSON.stringify({ severity: "ERROR", message: "startup.wiki_dirs_invalid", error: error instanceof Error ? error.message : String(error) }),
    );
    process.exit(1);
  }
}
