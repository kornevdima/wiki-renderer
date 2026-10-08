import type { WikiSnapshot } from "./types";

/**
 * The per-process snapshot cache: one entry per configured wiki, in memory only. A new snapshot replaces the old one
 * whole when the folder's fingerprint changes (`index.ts`). On `globalThis` under a `Symbol.for` key so every bundle of
 * the server (instrumentation, routes, pages) sees the same Map.
 */
export interface CacheEntry {
  snapshot: WikiSnapshot;
  sha: string;
  /** When the folder was last fingerprinted for this entry (ms since epoch). */
  lastCheckedAt: number;
}

const SLOT = Symbol.for("wiki-renderer.content-runtime.snapshotCache");

export function snapshotCacheStore(): Map<string, CacheEntry> {
  const g = globalThis as { [SLOT]?: Map<string, CacheEntry> };
  return (g[SLOT] ??= new Map<string, CacheEntry>());
}

/** In-flight builds, one promise per `wikiId:sha`, so concurrent requests share one build. */
const IN_FLIGHT_SLOT = Symbol.for("wiki-renderer.content-runtime.inFlightBuilds");

export function inFlightStore(): Map<string, Promise<WikiSnapshot>> {
  const g = globalThis as { [IN_FLIGHT_SLOT]?: Map<string, Promise<WikiSnapshot>> };
  return (g[IN_FLIGHT_SLOT] ??= new Map<string, Promise<WikiSnapshot>>());
}

/** Test-only: clears the cache and the in-flight map. */
export function resetRuntimeStateForTests(): void {
  snapshotCacheStore().clear();
  inFlightStore().clear();
}
