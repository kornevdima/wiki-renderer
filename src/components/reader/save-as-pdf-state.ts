import type { MermaidViewState } from "./mermaid-ready";

/**
 * Save as PDF's pure rules (US-106, US-107; SA-MOD Reader UI and print S7-R2, ADR-013). No React, no DOM, so they are
 * unit-testable.
 */

/** What the Mermaid store reports: the view's state and the key of the page view it began for. */
export interface ViewSnapshot {
  state: MermaidViewState;
  key: string | null;
}

/**
 * "Pending" = the page has diagrams and the view for THIS page has not settled. "Settled" only counts when the view
 * that settled is this page's own (`view.key === pageViewKey`): after a client navigation the new page renders while
 * the store still holds the previous page's settled view, and that must read as pending, not ready (C1). "No view
 * begun" is covered too (`getMermaidReady()` is already resolved then): before hydration, and between a navigation
 * and the new view beginning. A page with no diagram is never pending.
 */
export function isPdfPending(diagramCount: number, view: ViewSnapshot, pageViewKey: string): boolean {
  return diagramCount > 0 && !(view.state === "settled" && view.key === pageViewKey);
}

/**
 * Whether the non-Chrome hint shows (US-107, OA-6, TC-485). Chromium engines print like Chrome and show none. Every iOS
 * browser (CriOS, FxiOS, EdgiOS ...) is WebKit underneath, so it shows the hint. Firefox, Safari, and any empty or
 * unknown agent show it.
 */
export function shouldShowPdfHint(ua: string): boolean {
  if (/\b(iPhone|iPad|iPod)\b|\b(CriOS|FxiOS|EdgiOS|OPiOS)\//.test(ua)) return true;
  return !/\b(Chrome|Chromium)\/\d/.test(ua);
}

export interface PrintDeps {
  getView: () => ViewSnapshot;
  getReady: () => Promise<void>;
  print: () => void;
}

/**
 * One click. A click while pending is ignored (the control is `aria-disabled`). Otherwise the ready promise is read NOW,
 * at click time, and awaited (it never rejects), then `print` is called exactly once. Returns whether it printed.
 */
export async function requestPdf(diagramCount: number, pageViewKey: string, deps: PrintDeps): Promise<boolean> {
  if (isPdfPending(diagramCount, deps.getView(), pageViewKey)) return false;
  await deps.getReady();
  deps.print();
  return true;
}
