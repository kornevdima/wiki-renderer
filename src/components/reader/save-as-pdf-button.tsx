"use client";

import { PrinterIcon } from "lucide-react";
import { useId, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { getMermaidReady, getMermaidViewKey, getMermaidViewState, subscribeMermaidView } from "./mermaid-ready";
import { isPdfPending, requestPdf, type ViewSnapshot } from "./save-as-pdf-state";

/**
 * "Save as PDF" (US-106, FR-044; SA-MOD Reader UI and print S7-R2; ADR-013). The PDF is the browser's own print of the
 * page, never a server path.
 *
 * Readiness is the Mermaid view state, not a captured promise (the old `mermaidReady` prop is withdrawn). With
 * `diagramCount > 0` (the server render's placeholder count) and no settled view, the control is pending: the server
 * render and the first client render both use "none", so it is pending before hydration and there is no mismatch. A
 * click while pending is IGNORED (the control is `aria-disabled`, not `disabled`, so focus stays and the reason is
 * reachable through `aria-describedby`). A click when ready re-reads `getMermaidReady()` at click time, waits for it
 * (every diagram drawn or failed; it never rejects) and calls `window.print()` exactly once.
 */
export interface SaveAsPdfCopy {
  button: string;
  preparing: string;
}

const SERVER_VIEW = "none\u0000";
// One primitive snapshot (state + key) so `useSyncExternalStore` sees a stable value between changes.
const readView = () => `${getMermaidViewState()}\u0000${getMermaidViewKey() ?? ""}`;
const parseView = (raw: string): ViewSnapshot => {
  const [state, key = ""] = raw.split("\u0000");
  return { state: state as ViewSnapshot["state"], key: state === "none" ? null : key };
};
const liveView = (): ViewSnapshot => parseView(readView());

export function SaveAsPdfButton({ diagramCount, viewKey, copy }: { diagramCount: number; viewKey: string; copy: SaveAsPdfCopy }) {
  const view = parseView(useSyncExternalStore(subscribeMermaidView, readView, () => SERVER_VIEW));
  const statusId = useId();
  const pending = isPdfPending(diagramCount, view, viewKey);

  // Everything is read at click time from the live store, not from the rendered state or a captured promise.
  const onClick = () =>
    requestPdf(diagramCount, viewKey, { getView: liveView, getReady: getMermaidReady, print: () => window.print() });

  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden" data-testid="save-as-pdf">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="data-[pending=true]:cursor-not-allowed data-[pending=true]:opacity-(--opacity-disabled) data-[pending=true]:hover:border-border-strong data-[pending=true]:hover:bg-transparent"
        aria-disabled={pending ? "true" : undefined}
        aria-describedby={pending ? statusId : undefined}
        data-pending={pending ? "true" : undefined}
        onClick={() => void onClick()}
      >
        <PrinterIcon aria-hidden="true" />
        {copy.button}
      </Button>
      {diagramCount > 0 ? (
        // Only a page with diagrams can be pending, so only it needs the live region (it exists before its text changes).
        <span id={statusId} role="status" aria-live="polite" data-testid="save-as-pdf-status" className="text-xs text-muted-foreground empty:hidden">
          {pending ? copy.preparing : null}
        </span>
      ) : null}
    </span>
  );
}
