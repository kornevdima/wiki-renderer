/**
 * The per-page-view `mermaidReady` promise (US-104, DEP-017; SA-MOD Reader UI and print S6-R4). It settles once every
 * Mermaid placeholder of the current page view has been drawn or has failed, and is replaced by a fresh promise on
 * the next view (client navigation). Save as PDF (ADR-013) waits on `getMermaidReady()`.
 *
 * The slot is on `globalThis` under a `Symbol.for` key (BUG-014: module-scoped state was measured duplicated across
 * bundles). It is also published as `window.__mermaidReady`, the documented handle for e2e specs.
 *
 * `getMermaidViewState()` / `subscribeMermaidView()` are the small reader Save as PDF uses (US-106, S7-R2): the promise
 * alone cannot say "no view has begun", because `getMermaidReady()` is already resolved then.
 */
const SLOT = Symbol.for("wiki-renderer.reader.mermaidReady");
const LISTENERS = Symbol.for("wiki-renderer.reader.mermaidReady.listeners");

interface Slot {
  promise: Promise<void>;
  settle: () => void;
  /** The view's page has gone (its hydrator effect cleaned up): no view is current until the next one begins. */
  ended: boolean;
  settled: boolean;
  /** The page view this slot belongs to (`diagramSetKey`); Save as PDF only trusts "settled" for its own page's key (C1). */
  key: string;
}

type G = { [SLOT]?: Slot; [LISTENERS]?: Set<() => void>; __mermaidReady?: Promise<void> };

/** "none": no view is current (before the first begins, or between a cleanup and the next begin). */
export type MermaidViewState = "none" | "drawing" | "settled";

function notify(): void {
  for (const listener of (globalThis as G)[LISTENERS] ?? []) listener();
}

/** Starts a new page view: settles the previous one (its page is gone), installs a pending promise. */
export function beginMermaidView(key = ""): { promise: Promise<void>; settle: () => void; end: () => void } {
  const g = globalThis as G;
  g[SLOT]?.settle();
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const slot: Slot = {
    promise,
    ended: false,
    settled: false,
    key,
    settle: () => {
      if (slot.settled) return;
      slot.settled = true;
      resolve();
      if (g[SLOT] === slot) notify();
    },
  };
  g[SLOT] = slot;
  g.__mermaidReady = promise;
  notify();
  return {
    promise,
    settle: slot.settle,
    // The hydrator's effect cleanup: settles and, if this is still the current view, marks that none is.
    end: () => {
      slot.settle();
      if (g[SLOT] === slot && !slot.ended) {
        slot.ended = true;
        notify();
      }
    },
  };
}

/** The current view's promise; already resolved when no view has begun. Read it at click time, never capture it. */
export function getMermaidReady(): Promise<void> {
  const g = globalThis as G;
  return g[SLOT]?.promise ?? Promise.resolve();
}

/** Whether a view has begun and, if so, whether it has settled (every diagram drawn or failed). */
export function getMermaidViewState(): MermaidViewState {
  const slot = (globalThis as G)[SLOT];
  if (!slot || slot.ended) return "none";
  return slot.settled ? "settled" : "drawing";
}

/** The key the current view began with, or `null` when no view is current. */
export function getMermaidViewKey(): string | null {
  const slot = (globalThis as G)[SLOT];
  return !slot || slot.ended ? null : slot.key;
}

/** Subscribes to view changes (begin, settle, end); returns the unsubscribe. */
export function subscribeMermaidView(listener: () => void): () => void {
  const g = globalThis as G;
  const set = (g[LISTENERS] ??= new Set());
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
