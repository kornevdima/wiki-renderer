/**
 * Canonical locale set for the app's UI (ADR-018).
 *
 * English only for this release. `next-intl` is wired now so every string
 * routes through the catalogue from day one — adding a second locale later is
 * additive (a new `messages/<locale>.json` plus one entry here), not a
 * refactor of the render pipeline. `LOCALES` is a literal tuple, not derived
 * from the files present under `messages/`: dropping a second locale file in
 * `messages/` must not enable it on its own (US-002 AC3). The actual language
 * switcher (FR-031) is a later, WP-9 story — this module is its foundation.
 */
export const LOCALES = ["en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Source + only locale for this release. */
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
