/**
 * US-111 / TC-488 (client phase): the measure has a fixed name and no detail, is written once the view settles, and is
 * written for neither a page with no diagram nor a superseded view. The browser leg is the e2e assertion in flow g.
 */
import { describe, expect, it, vi } from "vitest";

import { MERMAID_DRAW_MEASURE, startDrawTiming, type PerfLike } from "./mermaid-timing";

function fakePerf() {
  const marks = new Set<string>();
  const measures: { name: string; start: string }[] = [];
  const perf: PerfLike = {
    mark: vi.fn((name: string) => marks.add(name)),
    measure: vi.fn((name: string, start: string) => {
      if (!marks.has(start)) throw new Error("missing mark");
      measures.push({ name, start });
    }),
    clearMarks: vi.fn((name: string) => marks.delete(name)),
  };
  return { perf, marks, measures };
}

describe("startDrawTiming", () => {
  it("measures under the fixed name from the start mark, with no detail, and clears the mark", () => {
    const { perf, marks, measures } = fakePerf();
    const timing = startDrawTiming({ perf, diagramCount: 2, isSuperseded: () => false });
    expect(marks.size).toBe(1);
    expect(timing.finish()).toBe(true);
    expect(measures).toHaveLength(1);
    expect(measures[0]!.name).toBe(MERMAID_DRAW_MEASURE);
    expect(MERMAID_DRAW_MEASURE).toBe("wiki-renderer:mermaid-draw");
    expect(vi.mocked(perf.measure).mock.calls[0]).toHaveLength(2);
    expect(marks.size).toBe(0);
  });

  it("writes nothing for a page with no diagram", () => {
    const { perf, measures } = fakePerf();
    const timing = startDrawTiming({ perf, diagramCount: 0, isSuperseded: () => false });
    expect(timing.finish()).toBe(false);
    expect(perf.mark).not.toHaveBeenCalled();
    expect(measures).toEqual([]);
  });

  it("writes nothing for a view that was superseded by navigation, and still clears its own mark", () => {
    const { perf, marks, measures } = fakePerf();
    let superseded = false;
    const timing = startDrawTiming({ perf, diagramCount: 1, isSuperseded: () => superseded });
    superseded = true;
    expect(timing.finish()).toBe(false);
    expect(measures).toEqual([]);
    expect(marks.size).toBe(0);
  });

  it("the mark name never carries the page key or path (TC-488)", () => {
    const { perf, marks } = fakePerf();
    startDrawTiming({ perf, diagramCount: 1, isSuperseded: () => false });
    for (const m of marks) expect(m).toMatch(/^wiki-renderer:mermaid-draw:start:\d+$/);
  });

  it("two overlapping views each measure from their own mark", () => {
    const { perf, measures } = fakePerf();
    const a = startDrawTiming({ perf, diagramCount: 1, isSuperseded: () => false });
    const b = startDrawTiming({ perf, diagramCount: 1, isSuperseded: () => false });
    expect(b.finish()).toBe(true);
    expect(a.finish()).toBe(true);
    expect(new Set(measures.map((m) => m.start)).size).toBe(2);
  });

  it("is a no-op without a Performance API and never throws when it fails", () => {
    expect(startDrawTiming({ perf: undefined, diagramCount: 1, isSuperseded: () => false }).finish()).toBe(false);
    const throwing: PerfLike = {
      mark: () => undefined,
      measure: () => {
        throw new Error("boom");
      },
      clearMarks: () => {
        throw new Error("boom");
      },
    };
    expect(startDrawTiming({ perf: throwing, diagramCount: 1, isSuperseded: () => false }).finish()).toBe(false);
    const markThrows: PerfLike = { ...throwing, mark: () => { throw new Error("x"); } };
    expect(startDrawTiming({ perf: markThrows, diagramCount: 1, isSuperseded: () => false }).finish()).toBe(false);
  });
});
