/**
 * Pure specs for `./stale-notice-format` (US-101 S1, S2; TC-127, TC-302). The gate is strictly greater-than.
 */
import { describe, expect, it } from "vitest";

import { formatUtcHm, isStaleNoticeDue } from "./stale-notice-format";

const T = 300000;
const since = new Date("2026-09-29T14:00:00Z");
const later = (ms: number) => new Date(since.getTime() + ms);

describe("isStaleNoticeDue", () => {
  it("299 999 ms: no notice", () => expect(isStaleNoticeDue(since, later(T - 1), T)).toBe(false));
  it("exactly 300 000 ms: no notice (strictly greater)", () => expect(isStaleNoticeDue(since, later(T), T)).toBe(false));
  it("300 001 ms: notice", () => expect(isStaleNoticeDue(since, later(T + 1), T)).toBe(true));
  it("zero elapsed and a clock skewed backwards: no notice", () => {
    expect(isStaleNoticeDue(since, later(0), T)).toBe(false);
    expect(isStaleNoticeDue(since, later(-1000), T)).toBe(false);
  });
  it("honours a different threshold", () => {
    expect(isStaleNoticeDue(since, later(1000), 1000)).toBe(false);
    expect(isStaleNoticeDue(since, later(1001), 1000)).toBe(true);
  });
});

describe("formatUtcHm", () => {
  it.each([
    ["2026-09-29T14:32:59Z", "14:32"],
    ["2026-09-29T03:05:00Z", "03:05"],
    ["2026-09-29T00:00:00Z", "00:00"],
    ["2026-09-29T23:59:59.999Z", "23:59"],
  ])("%s -> %s", (iso, expected) => expect(formatUtcHm(new Date(iso))).toBe(expected));

  it("is independent of TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatUtcHm(new Date("2026-09-29T14:32:59Z"))).toBe("14:32");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
