/**
 * The theme choice (US-172, FR-048, ADR-019 amendment 2026-10-03): `light`, `dark` or `system`, kept in a first-party
 * `theme` cookie that the root layout reads on the server and renders as `<html data-theme>`. `system` renders no
 * attribute, so the US-170 media query follows the operating system. Pure: no `next/*` import, so vitest loads it, and
 * the DOM helpers take their targets as arguments.
 */
export const THEME_COOKIE = "theme";
export const THEME_VALUES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_VALUES)[number];

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Any value that is not exactly one of the three (a missing cookie, `purple`, `""`, JSON) counts as `system`. */
export function parseTheme(raw: unknown): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** The `data-theme` attribute value for a choice; `undefined` (no attribute) for `system`. */
export function themeAttribute(choice: ThemeChoice): "light" | "dark" | undefined {
  return choice === "system" ? undefined : choice;
}

/** The `document.cookie` assignment string: `Path=/`, `SameSite=Lax`, one-year `Max-Age`, and `Secure` on https. */
export function serializeThemeCookie(choice: ThemeChoice, secure: boolean): string {
  return `${THEME_COOKIE}=${choice}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The slice of `document` the write needs, so a unit test can hand in a fake. */
export interface ThemeTarget {
  documentElement: { dataset: DOMStringMap };
  cookie: string;
  location: { protocol: string };
}

/**
 * Applies the choice to the open page at once, then stores it. A failing store (blocked or throwing cookie access) is
 * swallowed: the choice holds for this view and nothing is logged.
 */
export function applyTheme(doc: ThemeTarget, choice: ThemeChoice): void {
  const attribute = themeAttribute(choice);
  if (attribute) doc.documentElement.dataset.theme = attribute;
  else delete doc.documentElement.dataset.theme;
  try {
    doc.cookie = serializeThemeCookie(choice, doc.location.protocol === "https:");
  } catch {
    // The choice holds for this view only.
  }
}
