import type { ReactNode } from "react";

import { LOCALES, type Locale } from "@/lib/i18n";

/**
 * The English-only locale switcher (US-098, DEC-005, R-5, ADR-018): one native `<select>` with a real wrapping
 * `<label>`, one option per entry of `LOCALES` (exactly `en` today). There is no handler and no navigation:
 * with one option a change has nothing to do, and the interface language is never read from the control.
 * Rendered in the reader header and the signed-in home header only, never in the admin console. Not a wiki
 * switcher (`wiki-switcher-pin.test.ts`).
 *
 * Prop-driven like `HomeTopbar`: the caller resolves the `localeSwitcher.*` copy (`getTranslations` on `/`,
 * `useTranslations` in `PageShell`), so the component needs no request context.
 */
export interface LocaleSwitcherProps {
  label: string;
  /** The visible text of each locale's option, from `localeSwitcher.<locale>`. */
  optionLabels: Record<Locale, string>;
  /** Layout classes for the label, when the caller places it (the reader sidebar's foot, US-187); absent, the markup is unchanged. */
  className?: string;
  /**
   * A leading `icon-ui` glyph (the reader sidebar's globe, US-212 R12). Given, the select is the chrome's `control-h-m` (40px)
   * with room for the glyph; absent, the markup is unchanged.
   */
  icon?: ReactNode;
}

export function LocaleSwitcher({ label, optionLabels, className, icon }: LocaleSwitcherProps) {
  const select = (
    <select id="locale-switcher-select" name="locale" defaultValue="en" className={icon ? "min-h-(--control-h-m) pl-9" : undefined}>
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {optionLabels[locale]}
        </option>
      ))}
    </select>
  );
  return (
    <label data-testid="locale-switcher" className={className}>
      {label}{" "}
      {icon ? (
        <span className="relative block">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-(--icon-ui)"
          >
            {icon}
          </span>
          {select}
        </span>
      ) : (
        select
      )}
    </label>
  );
}
