/**
 * The client phase of the two-phase render timing (US-111, OA-9, TC-488). Pure, with `performance` injected.
 *
 * Definition: from the start of the Mermaid hydrator's draw effect for a page view to the moment that view settles
 * (every diagram drawn or errored, TC-415), as one `performance.measure` with a fixed name and no detail payload. A
 * page with no diagram, or a view that navigation superseded (the US-163 view-key guard), emits nothing.
 */
export const MERMAID_DRAW_MEASURE = "wiki-renderer:mermaid-draw";
const START_MARK_PREFIX = "wiki-renderer:mermaid-draw:start:";

export interface PerfLike {
  mark(name: string): unknown;
  measure(name: string, startMark: string): unknown;
  clearMarks(name: string): void;
}

let sequence = 0;

export interface DrawTiming {
  /** Call when the view settles. Returns whether a measure was written. */
  finish(): boolean;
}

/**
 * Marks the start of a view's draw. The mark name is a counter, never the page path or key (TC-488); it is cleared
 * again at `finish`. Any failure of the Performance API is swallowed: timing must never affect the page.
 */
export function startDrawTiming(options: {
  perf: PerfLike | undefined;
  diagramCount: number;
  isSuperseded: () => boolean;
}): DrawTiming {
  const { perf, diagramCount, isSuperseded } = options;
  if (perf === undefined || diagramCount <= 0) return { finish: () => false };
  const startMark = `${START_MARK_PREFIX}${++sequence}`;
  try {
    perf.mark(startMark);
  } catch {
    return { finish: () => false };
  }
  return {
    finish() {
      try {
        if (isSuperseded()) return false;
        perf.measure(MERMAID_DRAW_MEASURE, startMark);
        return true;
      } catch {
        return false;
      } finally {
        try {
          perf.clearMarks(startMark);
        } catch {
          // ignore
        }
      }
    },
  };
}
