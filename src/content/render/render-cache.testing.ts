import { renderBytesStore, renderCacheStore, renderSizeStore } from "./render-cache";

/**
 * **TEST-ONLY.** Cache reset and inspection for specs. No shipped file may import this module (the repo-wide
 * `*.testing` ESLint ban), so app code has no way to clear or read the cache.
 */
export function resetRenderCacheForTests(): void {
  renderCacheStore().clear();
  renderSizeStore().clear();
  renderBytesStore().clear();
}

export function renderCacheKeysForTests(): string[] {
  return [...renderCacheStore().keys()];
}
