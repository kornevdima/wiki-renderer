/**
 * US-111 / TC-488 (server phase): the line carries exactly the wiki id, the phase and the milliseconds, and exists only
 * for a rendered page. The page-level wiring (no line on a denial) is pinned in `app/w/.../page.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import { elapsedMs, emitServerTiming, SERVER_TIMING_EVENT, serverTimingFields, type RenderOutcome } from "./render-timing";

const WIKI = "6abc14b04a924c5ba918f4ff";

function capture() {
  const lines: { bindings: Record<string, unknown>; event: string; fields: Record<string, unknown> | undefined }[] = [];
  const logger = {
    child: vi.fn((bindings: Record<string, unknown>) => ({
      info: (event: string, fields?: Record<string, unknown>) => lines.push({ bindings, event, fields }),
    })),
  };
  return { lines, logger };
}

describe("serverTimingFields (TC-488)", () => {
  it("has exactly the keys wikiId, phase and ms", () => {
    const f = serverTimingFields("rendered", WIKI, 100, 112.345);
    expect(f).not.toBeNull();
    expect(Object.keys(f!).sort()).toEqual(["ms", "phase", "wikiId"]);
    expect(f).toEqual({ wikiId: WIKI, phase: "server", ms: 12.35 });
  });

  it.each<RenderOutcome>(["denied", "missing", "revoked", "unavailable"])("a %s outcome has no line", (outcome) => {
    expect(serverTimingFields(outcome, WIKI, 0, 5)).toBeNull();
  });

  it("ms is finite and non-negative for odd clocks", () => {
    for (const [a, b] of [
      [5, 1],
      [0, 0],
      [Number.NaN, 3],
      [1, Number.POSITIVE_INFINITY],
    ] as const) {
      const ms = elapsedMs(a, b);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("emitServerTiming (TC-488)", () => {
  it("writes one line: the fixed event, the wiki id as the only binding, and only phase and ms as fields", () => {
    const { lines, logger } = capture();
    emitServerTiming(logger, "rendered", WIKI, 10, 30);
    expect(lines).toEqual([{ bindings: { wikiId: WIKI }, event: SERVER_TIMING_EVENT, fields: { phase: "server", ms: 20 } }]);
    expect(SERVER_TIMING_EVENT).toBe("render.server");
  });

  it.each<RenderOutcome>(["denied", "missing", "revoked", "unavailable"])("writes nothing for a %s outcome", (outcome) => {
    const { lines, logger } = capture();
    emitServerTiming(logger, outcome, WIKI, 10, 30);
    expect(lines).toEqual([]);
    expect(logger.child).not.toHaveBeenCalled();
  });
});
