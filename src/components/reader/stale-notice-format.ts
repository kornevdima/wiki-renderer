/**
 * Pure logic for the stale notice (US-101; SA-MOD Reader UI and print A2/A4). Kept out of the page and the
 * component so the boundary and the time format are unit-testable and cannot drift with the server's locale.
 */

/**
 * True when the last successful check is OLDER than the threshold: strictly greater (TC-127, TC-302). Exactly
 * `thresholdMs` elapsed is not yet stale-noticed; one millisecond more is. `staleSince` is the first failure
 * time (S05 wave 5).
 */
export function isStaleNoticeDue(staleSince: Date, now: Date, thresholdMs: number): boolean {
  return now.getTime() - staleSince.getTime() > thresholdMs;
}

/** `HH:MM` in UTC, 24-hour, zero-padded (R-12). Never uses the process locale or timezone. */
export function formatUtcHm(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(at.getUTCHours())}:${two(at.getUTCMinutes())}`;
}
