/**
 * The "On this page" list's current section (US-219, FR-053, SA-MOD Reader UI and print E3-D4). The list exists twice in the DOM
 * (the rail and the folded copy), in different parts of the tree, and both must mark the same entry, so the current id lives in
 * one tiny module store that both read through `useSyncExternalStore`. Client-only; one page view at a time (the spy resets it
 * to `null` when it unmounts or the page changes).
 *
 * `currentSection` is the pure rule the spy applies, so the unit tests pin it without a browser.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function subscribeSection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getCurrentSection(): string | null {
  return current;
}
export function getServerSection(): string | null {
  return null;
}
export function setCurrentSection(id: string | null): void {
  if (id === current) return;
  current = id;
  for (const listener of [...listeners]) listener();
}

/**
 * An explicit selection (a list click, an anchor click, or a `#hash` on load or on `hashchange`) holds until the reader's NEXT
 * scroll, so a short section that can never reach the upper-third line is not overridden by the page-bottom rule. The scroll the
 * jump itself causes does not count: the pin starts `settling`, scroll events keep it settling (the caller restarts the timer), and
 * once the scroll has been quiet for `PIN_SETTLE_MS` it is `armed`; the next scroll while armed releases it. Pure reducer first.
 */
export type Pin = { id: string; phase: "settling" | "armed" } | null;
export const PIN_SETTLE_MS = 150;

export function nextPin(pin: Pin, event: "scroll" | "settled"): Pin {
  if (pin === null) return null;
  if (event === "settled") return { id: pin.id, phase: "armed" };
  return pin.phase === "settling" ? pin : null;
}

let pin: Pin = null;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

function startSettle(): void {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    pin = nextPin(pin, "settled");
  }, PIN_SETTLE_MS);
}

/** Marks `id` current at once and holds it until the reader's next scroll after the jump settles. */
export function pinSection(id: string): void {
  pin = { id, phase: "settling" };
  startSettle();
  setCurrentSection(id);
}
export function getPinnedSection(): string | null {
  return pin?.id ?? null;
}
/** Call on every scroll event. Returns true when it released a pin (the caller then recomputes by the normal rules). */
export function noteScroll(): boolean {
  if (pin === null) return false;
  const next = nextPin(pin, "scroll");
  if (next === null) {
    pin = null;
    clearTimeout(settleTimer);
    return true;
  }
  startSettle();
  return false;
}
export function clearPin(): void {
  pin = null;
  clearTimeout(settleTimer);
}

/**
 * The current section's index in `tops` (each heading's distance from the viewport top, in page order), or `-1` for no headings.
 * It is the last heading whose top is above `line` (the upper third of the viewport, the accepted mockup's rule); the first when
 * none is yet; and the last heading at the bottom of the page, so a short last section that never reaches the line is still
 * reachable.
 */
export function currentSection(tops: readonly number[], line: number, atBottom: boolean): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let found = 0;
  tops.forEach((top, index) => {
    if (top < line) found = index;
  });
  return found;
}

/**
 * The id the spy marks: the pinned (explicit) selection while one is held, else the normal rule. A short last section the reader
 * clicked, or arrived at by `#hash`, therefore wins over the page-bottom rule until the next scroll releases the pin.
 */
export function resolveCurrent(ids: readonly string[], tops: readonly number[], line: number, atBottom: boolean, pinned: string | null): string | null {
  if (pinned !== null && ids.includes(pinned)) return pinned;
  const index = currentSection(tops, line, atBottom);
  return index < 0 ? null : (ids[index] ?? null);
}

/**
 * True when the page is scrolled to its end. A page that fits the viewport has no end to reach, so it is never "at the bottom"
 * (otherwise its last section would be marked on load). A pixel or two of slack covers fractional scroll positions.
 */
export function isAtBottom(view: { scrollY: number; innerHeight: number; scrollHeight: number }): boolean {
  const { scrollY, innerHeight, scrollHeight } = view;
  if (![scrollY, innerHeight, scrollHeight].every(Number.isFinite)) return false;
  if (scrollHeight <= innerHeight + 1) return false;
  return scrollY + innerHeight >= scrollHeight - 2;
}
