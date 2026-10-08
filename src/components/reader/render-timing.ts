/**
 * The server phase of the two-phase render timing (US-111, OA-9, TC-488). Pure, so it is unit-testable: `page.tsx` is
 * wiring only.
 *
 * Definition: the time inside the page route, from `WikiPage` entry to just before it returns the rendered page. App
 * Router cannot set a response header from inside the render, so the timing is one structured log line, not a
 * `Server-Timing` header. It does not see serialisation, the network write or the proxy (TR-036's "request received to
 * response sent" is wider; the TTFB the perf harness reads is the cross-check).
 *
 * TC-488: the line carries the wiki id, the phase name and the milliseconds, and nothing else (no path, title, user or
 * content). It exists only for a page that was rendered: a denied, revoked, unavailable or missing outcome has none.
 */
export const SERVER_TIMING_EVENT = "render.server";

export type RenderOutcome = "rendered" | "denied" | "missing" | "revoked" | "unavailable";

export interface ServerTimingFields {
  wikiId: string;
  phase: "server";
  ms: number;
}

/** A monotonic clock in milliseconds. Behind a function so `page.tsx` does not call an impure global during render. */
export function nowMs(): number {
  return performance.now();
}

/** Elapsed milliseconds, never negative or non-finite (a clock that steps back reads as 0). */
export function elapsedMs(startedAt: number, now: number): number {
  const ms = now - startedAt;
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms * 100) / 100 : 0;
}

/** The fields of the server timing line, or `null` when the outcome is not a rendered page. */
export function serverTimingFields(outcome: RenderOutcome, wikiId: string, startedAt: number, now: number): ServerTimingFields | null {
  if (outcome !== "rendered") return null;
  return { wikiId, phase: "server", ms: elapsedMs(startedAt, now) };
}

interface TimingLogger {
  child(bindings: Record<string, unknown>): { info(event: string, fields?: Record<string, unknown>): void };
}

/**
 * Writes the line for a rendered page. The wiki id rides as a log binding (the logger's own convention), the phase and
 * the milliseconds as fields.
 */
export function emitServerTiming(logger: TimingLogger, outcome: RenderOutcome, wikiId: string, startedAt: number, now: number): void {
  const fields = serverTimingFields(outcome, wikiId, startedAt, now);
  if (fields === null) return;
  logger.child({ wikiId: fields.wikiId }).info(SERVER_TIMING_EVENT, { phase: fields.phase, ms: fields.ms });
}
