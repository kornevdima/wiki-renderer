import type { FrontmatterField } from "@/content/render/types";

import { tagChips, type TagChips } from "./frontmatter-tags";

/**
 * The page meta line's model (US-220, FR-023 via CR-008, SA-MOD Reader UI and print E3-D7, E3-D8, E3-5). Pure: built from
 * `rendered.frontmatterView` (already bounded and inert, US-071), never from the raw frontmatter, so the line can show
 * nothing that All properties does not. A part that is missing or unusable is `null`; with no part at all the whole model is
 * `null` and no line is drawn. Nothing here throws.
 *
 * - status: only a plain string (a wikilink, list, number, null or blank gives no badge). accepted, done and approved
 *   (trimmed, case-insensitive) are `success`; every other word is `neutral`, shown as written with its first letter
 *   upper-cased. `warning` and `danger` are never produced.
 * - date: `updated`, else `created`. Parsed strictly (`parseMetaDate`), read in UTC.
 * - tags: `tagChips`, the same rule All properties uses.
 */
export type MetaBadgeVariant = "success" | "neutral";

export interface MetaStatus {
  word: string;
  variant: MetaBadgeVariant;
}

export interface MetaDate {
  kind: "updated" | "created";
  /** `YYYY-MM-DD` (UTC) for `<time datetime>`. */
  iso: string;
  date: Date;
}

export interface PageMeta {
  status: MetaStatus | null;
  date: MetaDate | null;
  tags: TagChips | null;
}

const SUCCESS = new Set(["accepted", "done", "approved"]);

export function metaStatus(value: unknown): MetaStatus | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  const [first = ""] = text;
  return { word: first.toUpperCase() + text.slice(first.length), variant: SUCCESS.has(text.toLowerCase()) ? "success" : "neutral" };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:(Z)|([+-])(\d{2}):(\d{2}))?$/;

/**
 * `YYYY-MM-DD`, or an ISO date-time (`T` or a space, optional seconds and fraction, `Z`, a `+hh:mm` offset or none, which is
 * read as UTC). Real calendar days only (`2026-02-30` is unusable), year 1 to 9999, and the offset is applied so the result
 * is the UTC instant. Anything else, including a non-string, is `null`.
 */
export function parseMetaDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const dateOnly = DATE_ONLY.exec(value);
  const dateTime = dateOnly ? null : DATE_TIME.exec(value);
  const m = dateOnly ?? dateTime;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = dateTime ? Number(dateTime[4]) : 0;
  const minute = dateTime ? Number(dateTime[5]) : 0;
  const second = dateTime && dateTime[6] !== undefined ? Number(dateTime[6]) : 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  date.setUTCHours(hour, minute, second, 0);
  let offsetMinutes = 0;
  if (dateTime && dateTime[8] !== undefined) {
    const offsetHour = Number(dateTime[9]);
    const offsetMinute = Number(dateTime[10]);
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMinutes = (dateTime[8] === "-" ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  const instant = new Date(date.getTime() - offsetMinutes * 60_000);
  const y = instant.getUTCFullYear();
  return Number.isNaN(instant.getTime()) || y < 1 || y > 9999 ? null : instant;
}

function valueOf(fields: readonly FrontmatterField[], key: string): unknown {
  return fields.find((field) => field.key === key)?.value;
}

function metaDate(fields: readonly FrontmatterField[]): MetaDate | null {
  for (const kind of ["updated", "created"] as const) {
    const date = parseMetaDate(valueOf(fields, kind));
    if (date) return { kind, iso: date.toISOString().slice(0, 10), date };
  }
  return null;
}

export function buildPageMeta(fields: readonly FrontmatterField[] | undefined): PageMeta | null {
  if (!fields || fields.length === 0) return null;
  const status = metaStatus(valueOf(fields, "status"));
  const date = metaDate(fields);
  const tags = tagChips("tags", valueOf(fields, "tags"));
  return status || date || tags ? { status, date, tags } : null;
}
