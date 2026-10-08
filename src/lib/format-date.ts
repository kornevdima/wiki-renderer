/**
 * One readable date and time format for every table (US-180, FR-051). Pure: UTC getters only, so the text is
 * the same on any server time zone or OS locale. The short month names are passed in (the pages read them from
 * the English catalogue's `dates` namespace, ADR-018), which keeps this core free of the catalogue and testable.
 */

/** The empty marker shown in place of a date that is missing or invalid (the glyph the audit table shows for a missing actor). */
export const EMPTY_CELL_MARKER = "—";

/** The 12 short month names, January first. */
export type MonthNames = readonly [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

export const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

/** Builds the month names from a `dates` translator (`getTranslations("dates")`). */
export function monthNamesFrom(t: (key: (typeof MONTH_KEYS)[number]) => string): MonthNames {
  return MONTH_KEYS.map((key) => t(key)) as unknown as MonthNames;
}

function toValidDate(value: Date | null | undefined): Date | null {
  if (!(value instanceof Date)) return null;
  return Number.isNaN(value.getTime()) ? null : value;
}

const two = (n: number): string => String(n).padStart(2, "0");

/** `2 Oct 2026` (UTC). An invalid or missing value returns `EMPTY_CELL_MARKER`; never throws. */
export function formatDate(value: Date | null | undefined, months: MonthNames): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_CELL_MARKER;
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `2 Oct 2026, 09:41:07 UTC`. Hour, minute and second are always two digits. */
export function formatDateTime(value: Date | null | undefined, months: MonthNames): string {
  const date = toValidDate(value);
  if (!date) return EMPTY_CELL_MARKER;
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`;
  return `${formatDate(date, months)}, ${time} UTC`;
}
