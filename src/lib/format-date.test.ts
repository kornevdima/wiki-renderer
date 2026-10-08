import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import messages from "../../messages/en.json";
import { EMPTY_CELL_MARKER, formatDate, formatDateTime, monthNamesFrom, type MonthNames } from "./format-date";

/**
 * US-180 contract rows 1, 2, 4, 5, 6, 7 (+ M1 for row 3). Row 3 is these same assertions run under two
 * TZ/LANG settings from the command line (see the report): the formatter must give one text on any server.
 */

const MONTHS = monthNamesFrom((key) => messages.dates[key]);

describe("US-180 row 1: formatDate", () => {
  it("shows day, short month, year in UTC", () => {
    expect(formatDate(new Date("2026-10-02T00:00:00Z"), MONTHS)).toBe("2 Oct 2026");
    expect(formatDate(new Date("2026-09-05"), MONTHS)).toBe("5 Sep 2026");
  });
});

describe("US-180 row 2: formatDateTime", () => {
  it("adds a two-digit UTC time and the UTC suffix", () => {
    expect(formatDateTime(new Date("2026-10-02T09:41:07Z"), MONTHS)).toBe("2 Oct 2026, 09:41:07 UTC");
    expect(formatDateTime(new Date("2026-10-02T00:05:03Z"), MONTHS)).toBe("2 Oct 2026, 00:05:03 UTC");
  });
});

describe("US-180 row 3: the same text on any server time zone", () => {
  const lateDec = new Date("2026-12-31T23:30:00Z");
  // M1 (env-gated mutation): US180_MUTATE=M1 swaps the formatters under test for local-time variants. Run under
  // TZ=Pacific/Auckland, where 2026-12-31T23:30Z is already 1 Jan 2027, so this describe must go red.
  const mutated = process.env.US180_MUTATE === "M1";
  const two = (n: number): string => String(n).padStart(2, "0");
  const localDate = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const localDateTime = (d: Date): string =>
    `${localDate(d)}, ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} UTC`;
  const underTestDate = mutated ? localDate : (d: Date) => formatDate(d, MONTHS);
  const underTestDateTime = mutated ? localDateTime : (d: Date) => formatDateTime(d, MONTHS);

  it("stays on 31 Dec in UTC whatever TZ the process has", () => {
    expect(underTestDate(lateDec)).toBe("31 Dec 2026");
    expect(underTestDateTime(lateDec)).toBe("31 Dec 2026, 23:30:00 UTC");
  });
});

describe("US-180 row 4: boundaries", () => {
  it("1 Jan 00:00:00Z", () => {
    expect(formatDate(new Date("2027-01-01T00:00:00Z"), MONTHS)).toBe("1 Jan 2027");
    expect(formatDateTime(new Date("2027-01-01T00:00:00Z"), MONTHS)).toBe("1 Jan 2027, 00:00:00 UTC");
  });
  it("31 Dec 23:59:59Z", () => {
    expect(formatDateTime(new Date("2026-12-31T23:59:59Z"), MONTHS)).toBe("31 Dec 2026, 23:59:59 UTC");
  });
  it("29 Feb 2028 (leap day)", () => {
    expect(formatDate(new Date("2028-02-29T12:00:00Z"), MONTHS)).toBe("29 Feb 2028");
  });
});

describe("US-180 row 5: an invalid or missing value never throws", () => {
  it.each([undefined, null, new Date("x")])("returns the empty marker for %s", (value) => {
    expect(formatDate(value, MONTHS)).toBe(EMPTY_CELL_MARKER);
    expect(formatDateTime(value, MONTHS)).toBe(EMPTY_CELL_MARKER);
  });
  it("the marker is the em dash", () => {
    expect(EMPTY_CELL_MARKER).toBe("—");
  });
});

describe("US-180 row 6: month names come from the catalogue", () => {
  it("returns the names it is given", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"] as unknown as MonthNames;
    expect(formatDate(new Date("2026-03-04T00:00:00Z"), names)).toBe("4 c 2026");
  });
  it("the catalogue holds the 12 English short names in order", () => {
    expect(MONTHS).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });
  it("the formatter module uses no Intl and no toLocale*", () => {
    const source = readFileSync(fileURLToPath(new URL("./format-date.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/\bIntl\b/);
    expect(source).not.toMatch(/toLocale/);
    expect(source).not.toMatch(/\.get(Date|Month|FullYear|Hours|Minutes|Seconds)\(/);
  });
});
