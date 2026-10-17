"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { useSidebarState } from "@/components/sidebar-state";
import { Button } from "@/components/ui/button";
import { WidthHandle } from "@/components/ui/width-handle";
import {
  READING,
  applyPageWidth,
  buildGuides,
  acceptMetrics,
  resetTakesFocus,
  serializePageWidthCookie,
  type PageWidthChoice,
} from "@/lib/page-width";
import { a4IdOf, farGuide, handleMax, handleValue, resolveWidth, shouldAutoCollapse } from "@/lib/sidebar";

/**
 * The reader's page width (US-280). `PageWidthProvider` (root layout) owns the choice the server read from the `wr-page-width`
 * cookie; a change goes on the document at once (`applyPageWidth`: `data-page-width` and `--wr-page-px` through the CSSOM) and is
 * stored when the drag or key press ends. `PageWidthHandle` is the design system's WidthHandle on the article's right edge,
 * `PageWidthReset` the Reset button in the page bar. Both are CSS-hidden below 1200 px, where the column ignores a stored width.
 */
interface PageWidthState {
  choice: PageWidthChoice;
  /** Shows a width now (a drag in progress); stores nothing. */
  preview: (next: PageWidthChoice) => void;
  /** Shows and stores a width. */
  commit: (next: PageWidthChoice) => void;
  /** Back to Reading, and the cookie is deleted. */
  reset: () => void;
}

const PageWidthContext = createContext<PageWidthState>({ choice: READING, preview: () => undefined, commit: () => undefined, reset: () => undefined });

export function usePageWidth(): PageWidthState {
  return useContext(PageWidthContext);
}

function store(choice: PageWidthChoice): void {
  try {
    document.cookie = serializePageWidthCookie(choice, location.protocol === "https:");
  } catch {
    // The width holds for this view only.
  }
}

export function PageWidthProvider({ choice: initial, children }: { choice: PageWidthChoice; children: ReactNode }) {
  const [choice, setChoice] = useState<PageWidthChoice>(initial);
  const preview = useCallback((next: PageWidthChoice) => {
    setChoice(next);
    applyPageWidth(document.documentElement, next);
  }, []);
  const commit = useCallback(
    (next: PageWidthChoice) => {
      preview(next);
      store(next);
    },
    [preview],
  );
  const reset = useCallback(() => commit(READING), [commit]);
  const state = useMemo(() => ({ choice, preview, commit, reset }), [choice, preview, commit, reset]);
  return <PageWidthContext.Provider value={state}>{children}</PageWidthContext.Provider>;
}

export interface PageWidthCopy {
  label: string;
  reading: string;
  a4Portrait: string;
  a4Landscape: string;
  full: string;
}

interface Metrics {
  /** The 36em measure as computed from the article's font size. */
  readingPx: number;
  /** The article's widest width with its rail beside it: the content slot's width inside its padding, less the rail's room. */
  fullPx: number;
  /** The widest the handle goes: the whole slot (an A4 guide drops the rail under the article). */
  maxPx: number;
}

function measure(anchor: HTMLElement): Metrics | null {
  const probe = anchor.querySelector<HTMLElement>("[data-width-probe]");
  const extraProbe = anchor.querySelector<HTMLElement>("[data-width-extra-probe]");
  const column = anchor.closest(".wr-column");
  const slot = column?.parentElement;
  if (!probe || !extraProbe || !column || !slot) return null;
  const style = getComputedStyle(slot);
  const maxPx = slot.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const readingPx = probe.getBoundingClientRect().width;
  const extra = column.querySelector(".wr-layout--aside") ? extraProbe.getBoundingClientRect().width : 0;
  const fullPx = maxPx - extra;
  return acceptMetrics(window.matchMedia("print").matches, readingPx, fullPx) ? { readingPx, fullPx, maxPx } : null;
}

/**
 * The handle and its host. The host is a zero-footprint box over the article (`.wr-width-track`, absolute, as wide as the article
 * and as tall as the page) holding a `position: sticky` box (`.wr-width-sticky`) about a viewport tall, so the grip stays on screen
 * on a long page. The probe is an empty box one measure wide in the article's font size: its width is the Reading guide. The
 * handle mounts after the first client render, once the room and the measure are known; until then the server's CSS already
 * shows the stored width.
 */
export function PageWidthHandle({ copy }: { copy: PageWidthCopy }) {
  const { choice, preview, commit, reset } = usePageWidth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const anchor = host.current;
    const slot = anchor?.closest(".wr-column")?.parentElement;
    if (!anchor || !slot) return;
    // Never measure for print: the host and probes are display:none there (a 0 px probe). Measure on screen only and keep the last good
    // values, so the handle is never unmounted by a print. Measure again when print ends, the slot resizes or the window resizes.
    const printing = window.matchMedia("print");
    const update = () => {
      if (printing.matches) return;
      const next = measure(anchor);
      if (next !== null) setMetrics((prev) => (prev && prev.readingPx === next.readingPx && prev.fullPx === next.fullPx && prev.maxPx === next.maxPx ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    printing.addEventListener("change", update);
    window.addEventListener("afterprint", update);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      printing.removeEventListener("change", update);
      window.removeEventListener("afterprint", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The A4 guide the drag is snapped to now (US-281, "Drag snaps to landscape"); null when none or when not dragging.
  const [snapId, setSnapId] = useState<string | null>(null);
  // "Panel stays, page narrows" (US-281): the readout is the page's real width, held to the room beside the side panel.
  const value = metrics ? handleValue(choice, metrics.readingPx, metrics.fullPx, snapId) : 0;
  const { collapsed, previewCollapsed, setCollapsed } = useSidebarState();
  // US-281 R4c. The drag collapses the sidebar live when it reaches an A4 guide the expanded room cannot hold, and expands it again if
  // the drag goes back, but only a collapse this drag made (`byDrag`); the cookie is written on commit alone. The decisions' ground is the
  // expanded room, remembered while the sidebar is expanded, so a live collapse does not change which guide is the far end.
  const expanded = useRef<{ room: number; full: number } | null>(null);
  const byDrag = useRef(false);
  useEffect(() => {
    if (metrics && !collapsed) expanded.current = { room: metrics.maxPx, full: metrics.fullPx };
  }, [metrics, collapsed]);
  const guides = useMemo(() => (metrics ? buildGuides(metrics.readingPx, metrics.fullPx, copy) : []), [metrics, copy]);
  const ground = (m: Metrics) => (byDrag.current && expanded.current ? expanded.current : { room: m.maxPx, full: m.fullPx });
  const resolve = (m: Metrics, px: number, id: string | null): PageWidthChoice => {
    const g = ground(m);
    return resolveWidth(px, id, g.full, farGuide(guides, g.full));
  };
  const wantsCollapse = (m: Metrics, next: PageWidthChoice) => shouldAutoCollapse(next, ground(m).room, m.maxPx - m.fullPx, false);
  const onDragChange = (m: Metrics, px: number, id: string | null) => {
    const next = resolve(m, px, id);
    setSnapId(a4IdOf(next));
    preview(next);
    if (wantsCollapse(m, next)) {
      if (!collapsed && !byDrag.current) {
        byDrag.current = true;
        previewCollapsed(true);
      }
    } else if (byDrag.current) {
      byDrag.current = false;
      previewCollapsed(false);
    }
  };
  // Release (or a cancelled drag, which the handle also reports here): the width is stored, and the collapse with it only when it is wanted.
  const onDragCommit = (m: Metrics, px: number, id: string | null) => {
    setSnapId(null);
    const next = resolve(m, px, id);
    const want = wantsCollapse(m, next);
    const liveCollapse = byDrag.current;
    byDrag.current = false;
    commit(next);
    if (want) setCollapsed(true);
    else if (liveCollapse) previewCollapsed(false); // a collapse made live by this drag that is no longer wanted; one made by hand stays
  };
  return (
    <div ref={host} className="wr-width-track" data-testid="page-width-host">
      <span aria-hidden="true" className="wr-width-probe" data-width-probe />
      <span aria-hidden="true" className="wr-width-probe wr-width-probe--extra" data-width-extra-probe />
      <span aria-hidden="true" className="wr-width-room" ref={room} data-width-room />
      <div className="wr-width-sticky">
        {metrics ? (
          <WidthHandle
            value={value}
            min={metrics.readingPx}
            max={handleMax(metrics.maxPx, guides)}
            symmetric
            labelRoom={room}
            labelsAt="grip"
            guides={guides}
            label={copy.label}
            resetTo="reading"
            onChange={(px, id) => onDragChange(metrics, px, id)}
            onCommit={(px, id) => onDragCommit(metrics, px, id)}
            onReset={reset}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Reset, in the page bar: shown only when the width is not Reading, and only from 1200 px. */
export function PageWidthReset() {
  const t = useTranslations("pageWidth");
  const { choice, reset } = usePageWidth();
  if (choice.kind === "reading") return null;
  // Reset unmounts itself, which would drop keyboard focus to <body>: a keyboard activation hands focus to the handle first (it stays
  // mounted from 1200 px). A mouse click moves nothing: a programmatic focus counts as keyboard focus to the handle and would leave
  // its guides showing.
  const onReset = (event: MouseEvent<HTMLButtonElement>) => {
    if (resetTakesFocus(event.detail)) document.querySelector<HTMLElement>('[data-slot="width-handle-grip"]')?.focus({ preventScroll: true });
    reset();
  };
  return (
    <Button type="button" variant="ghost" size="sm" className="max-[1199.98px]:hidden" data-testid="page-width-reset" onClick={onReset}>
      {t("reset")}
    </Button>
  );
}
