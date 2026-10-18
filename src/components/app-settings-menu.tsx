"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { SettingsMenu } from "@/components/layout/settings-menu";
import type { ThemeControlProps } from "@/components/layout/theme-control";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { LOCALES } from "@/lib/i18n";

/**
 * The one settings menu at the end of every top bar (US-286): the design system's `SettingsMenu` with the Theme group fed
 * from the app's own `ThemeProvider` (so a pick is applied at once and remembered in the `theme` cookie by `@/lib/theme`, as
 * before) and a Language inline radio group with English only (US-098: there is no handler, the interface language is never
 * read from the control). A Settings item (US-277) below Language opens `/settings`. Rendered on the home page, the Settings page and in the reader's topbar.
 */
export function AppSettingsMenu() {
  const t = useTranslations("settingsMenu");
  const tTheme = useTranslations("theme");
  const tLocale = useTranslations("localeSwitcher");
  const { choice, set } = useTheme();
  const languageId = useId();
  const theme: ThemeControlProps = {
    value: choice,
    onValueChange: set,
    labels: { label: tTheme("label"), light: tTheme("light"), dark: tTheme("dark"), system: tTheme("system") },
  };
  return (
    <SettingsMenu
      label={t("label")}
      theme={theme}
      items={
        <>
          <DropdownMenuLabel id={languageId}>{tLocale("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="en" aria-labelledby={languageId} data-testid="settings-language">
            {LOCALES.map((locale) => (
              <DropdownMenuRadioItem key={locale} value={locale} data-testid={`settings-language-${locale}`}>
                {tLocale(locale)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" data-testid="settings-link">
              {t("settings")}
            </Link>
          </DropdownMenuItem>
        </>
      }
    />
  );
}
