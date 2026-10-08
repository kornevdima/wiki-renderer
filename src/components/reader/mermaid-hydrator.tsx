"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import type { MermaidBlock } from "@/content/render/types";

import { diagramSetKey } from "./diagram-set-key";
import { createHydrationQueue, type MermaidLike } from "./mermaid-hydrate";
import { beginMermaidView, getMermaidViewKey } from "./mermaid-ready";
import { startDrawTiming, type DrawTiming } from "./mermaid-timing";

// Re-exported for its existing importers; the server page imports it from `diagram-set-key` (this file is a client module).
export { diagramSetKey };

/**
 * `MermaidHydrator` (US-104, SA-MOD Reader UI and print S6-R4). Renders nothing; after mount it draws the page's
 * Mermaid placeholders in the browser. `mermaid` is imported here only, lazily, so a page with no diagram never loads
 * it and it never reaches the server bundle. The rules live in `mermaid-hydrate.ts`.
 *
 * One effect per page view, keyed by `viewKey` (`diagramSetKey`: the page path and its diagram set): a client navigation
 * or a changed diagram set gives a new key, which settles the old `mermaidReady` and starts a new one. Blocks arrive as a
 * prop but are read through the effect closure of the view they belong to.
 *
 * Client phase timing (US-111, OA-9): a `performance.measure` named `wiki-renderer:mermaid-draw` from the start of the draw (after any wait for
 * the previous view's draw in flight) to the view settling, for a page with diagrams and a view that is still current (`mermaid-timing.ts`).
 */

// R2-1: one queue, so a view starting mid-draw waits for the cancelled one to finish before it picks its blocks.
const enqueue = createHydrationQueue();

export function MermaidHydrator({ pageKey, blocks }: { pageKey: string; blocks: MermaidBlock[] }) {
  const t = useTranslations("mermaid");
  const errorText = t("drawError");
  const captionText = t("caption");
  const diagramName = t("diagramName");
  const viewKey = diagramSetKey(pageKey, blocks);

  useEffect(() => {
    let cancelled = false;
    const view = beginMermaidView(viewKey);
    // The start mark is taken when hydration starts, after any wait for the previous view's draw in flight (minor 3), so the
    // client phase is the draw only.
    let timing: DrawTiming | undefined;
    void enqueue({
      root: document.querySelector("main") ?? document,
      blocks,
      errorText,
      captionText,
      diagramName,
      isCancelled: () => cancelled,
      onStart: () => {
        timing = startDrawTiming({
          perf: typeof performance === "undefined" ? undefined : performance,
          diagramCount: blocks.length,
          isSuperseded: () => cancelled || getMermaidViewKey() !== viewKey,
        });
      },
      load: async () => (await import("mermaid")).default as unknown as MermaidLike,
    }).finally(() => {
      timing?.finish();
      view.settle();
    });
    return () => {
      cancelled = true;
      view.end();
    };
    // `blocks`, `errorText` and `captionText` belong to this page view; only a new page or a changed diagram set (`viewKey`) starts a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  return null;
}
