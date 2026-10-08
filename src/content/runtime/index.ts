import "server-only";

import { dropStaleRenderedForWiki } from "@/content/render/render-cache";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

import { build } from "./build";
import { inFlightStore, snapshotCacheStore } from "./cache";
import { parseWikiDirs, type LocalWiki } from "./config";
import { createLocalSource } from "./local-source";
import type { SnapshotResult, WikiSnapshot } from "./types";

/**
 * `content/runtime`'s public surface. Every configured wiki is a folder on disk (`config.ts`). `getSnapshot` re-checks
 * the folder's fingerprint at most once per `WIKI_RECHECK_MS` and rebuilds when it changed, so an edit in the vault
 * shows on the next request after that window. Concurrent requests for one revision share one build.
 */
let configured: LocalWiki[] | undefined;

export type { LocalWiki };

export function listWikis(): readonly LocalWiki[] {
  return (configured ??= parseWikiDirs(env.WIKI_DIRS, process.cwd(), process.env.HOME));
}

export function findWiki(wikiId: string): LocalWiki | undefined {
  return listWikis().find((w) => w.id === wikiId);
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

/**
 * `src/instrumentation.ts`'s startup check: parses `WIKI_DIRS` and logs one line per wiki, or exits non-zero on a bad
 * list. Kept here, behind that file's dynamic import, so `process.exit` never reaches the Edge bundle.
 */
export function assertWikisOrExit(): void {
  try {
    for (const wiki of listWikis()) log.child({ wikiId: wiki.id }).info("startup.wiki", { root: wiki.root });
  } catch (error) {
    console.error(
      JSON.stringify({ severity: "ERROR", message: "startup.wiki_dirs_invalid", error: error instanceof Error ? error.message : String(error) }),
    );
    process.exit(1);
  }
}
