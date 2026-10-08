import type { WikiSnapshot } from "@/content/runtime/types";
import type { RenderedPage } from "./types";

/**
 * The immutable render cache (US-087, SA-MOD Rendering pipeline §4, NFR-001, BR-038). Keyed
 * `wikiId:sha:path`; wiki ids and SHAs are hex, so the key is unambiguous even when a path contains `:`. The key
 * carries no viewer identity. Insert-only: an entry is never replaced or mutated; the one removal is `dropRenderedForWiki`, the
 * whole-wiki eviction of a detected revocation (US-056, T6).
 *
 * Bounded only as part of the whole-wiki LRU (US-058): `content/runtime/budget.ts` drops every entry of a wiki with its
 * snapshot, and a rebuild swap drops the old sha's entries (D6). R-S5-6: cached output is sanitised once and kept for the SHA's
 * lifetime, so a sanitiser schema fix takes effect for new SHAs or after an instance restart (no versioned key).
 *
 * The Map lives on `globalThis` under a `Symbol.for` key, like the repo's other process-wide state, because a
 * module-scoped slot can be duplicated across bundles. The test-only reset is in `render-cache.testing.ts`.
 */
const SLOT = Symbol.for("wiki-renderer.content.renderCache");

export function renderCacheStore(): Map<string, RenderedPage> {
  const g = globalThis as { [SLOT]?: Map<string, RenderedPage> };
  return (g[SLOT] ??= new Map<string, RenderedPage>());
}

/**
 * The render-byte accounting (US-058 D1): per entry, an estimate of its size (the page's source byte length: React
 * elements have no cheap size), and the running per-wiki total the budget reads. Same `Symbol.for` anchoring as the
 * cache; both are cleared with it (`render-cache.testing.ts`), and shrink wherever entries are dropped here.
 */
const SIZES_SLOT = Symbol.for("wiki-renderer.content.renderCacheSizes");
const BYTES_SLOT = Symbol.for("wiki-renderer.content.renderCacheBytes");

export function renderSizeStore(): Map<string, number> {
  const g = globalThis as { [SIZES_SLOT]?: Map<string, number> };
  return (g[SIZES_SLOT] ??= new Map<string, number>());
}

export function renderBytesStore(): Map<string, number> {
  const g = globalThis as { [BYTES_SLOT]?: Map<string, number> };
  return (g[BYTES_SLOT] ??= new Map<string, number>());
}

/** The estimated render bytes currently cached for one wiki (0 when none). */
export function renderBytesForWiki(wikiId: string): number {
  return renderBytesStore().get(wikiId) ?? 0;
}

/** Inserts one entry and grows the wiki's counter by `bytes` (a re-insert of a live key is a no-op, insert-only). */
export function insertRendered(wikiId: string, key: string, rendered: RenderedPage, bytes: number): void {
  const store = renderCacheStore();
  if (store.has(key)) return;
  store.set(key, rendered);
  renderSizeStore().set(key, bytes);
  renderBytesStore().set(wikiId, renderBytesForWiki(wikiId) + bytes);
}

export function renderCacheKey(snapshot: Pick<WikiSnapshot, "wikiId" | "sha">, path: string): string {
  return `${snapshot.wikiId}:${snapshot.sha}:${path}`;
}

/**
 * Freezes the entry and its own arrays (BR-038: a stored render is never mutated). `headings` is the parse output,
 * already frozen at parse time by `parsePages` (BR-036), so it is not frozen again here.
 */
export function freezeRendered(page: RenderedPage): RenderedPage {
  Object.freeze(page.frontmatterView);
  Object.freeze(page.mermaidBlocks);
  for (const entry of page.outline) Object.freeze(entry);
  Object.freeze(page.outline);
  return Object.freeze(page);
}

/**
 * Removes every render-cache entry of one wiki (US-056, T6: a revoked wiki is evicted as one unit, together with
 * its snapshot entry). Matches the `${wikiId}:` prefix; ids are hex, so `w1:` never matches `w10:`. Other wikis'
 * entries are untouched. Returns the number removed.
 */
export function dropRenderedForWiki(wikiId: string): number {
  return dropMatching(wikiId, () => true);
}

/**
 * D6: drops every entry of one wiki whose sha is not `keepSha` (the rebuild swap's old-sha entries) and reduces the
 * counter by what they were worth. Returns the number removed.
 */
export function dropStaleRenderedForWiki(wikiId: string, keepSha: string): number {
  const keepPrefix = `${wikiId}:${keepSha}:`;
  return dropMatching(wikiId, (key) => !key.startsWith(keepPrefix));
}

function dropMatching(wikiId: string, predicate: (key: string) => boolean): number {
  const store = renderCacheStore();
  const sizes = renderSizeStore();
  const prefix = `${wikiId}:`;
  let removed = 0;
  let freed = 0;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix) && predicate(key)) {
      store.delete(key);
      freed += sizes.get(key) ?? 0;
      sizes.delete(key);
      removed++;
    }
  }
  const left = Math.max(0, renderBytesForWiki(wikiId) - freed);
  if (left > 0) renderBytesStore().set(wikiId, left);
  else renderBytesStore().delete(wikiId);
  return removed;
}
