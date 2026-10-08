"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyTheme, parseTheme, THEME_VALUES, type ThemeChoice } from "@/lib/theme";

/**
 * The Light / Dark / System control (US-172, FR-048, ADR-019 amendment 2026-10-03). The root layout reads the `theme`
 * cookie on the server, renders `<html data-theme>`, and hands the same choice to `ThemeProvider`, so the control
 * starts on the stored value with no client read. A pick calls `applyTheme` (attribute at once, then the cookie).
 *
 * Two shapes, one choice: `ThemeControl` is the app headers' icon button with a radio group in a popover, and
 * `ThemeSelect` is the reader header's select with a leading icon. Neither is mounted on sign-in, join or 404.
 */
export interface ThemeState {
  choice: ThemeChoice;
  set: (next: string) => void;
}

const ThemeContext = createContext<ThemeState>({ choice: "system", set: () => undefined });

/**
 * Owns the choice for the whole document. The root layout does not re-render on a soft navigation, so the state lives
 * here, above the pages, and a control mounted later (after a `next/link` move) reads the current choice, not the one
 * the layout rendered on the first load.
 */
export function ThemeProvider({ choice: initial, children }: { choice: ThemeChoice; children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const set = useCallback((next: string) => {
    const value = parseTheme(next);
    setChoice(value);
    applyTheme(document, value);
  }, []);
  const state = useMemo(() => ({ choice, set }), [choice, set]);
  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>;
}

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;

/** The shared choice and its setter, read through the provider so no control keeps a copy of its own. */
export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

function useThemeChoice(): [ThemeChoice, (next: string) => void] {
  const { choice, set } = useTheme();
  return [choice, set];
}

export function ThemeControl() {
  const t = useTranslations("theme");
  const [choice, set] = useThemeChoice();
  const legendId = useId();
  const Icon = ICONS[choice];
  return (
    <span data-testid="theme-control-host" className="print:hidden">
      <Popover>
        <PopoverTrigger
          type="button"
          data-testid="theme-control"
          aria-label={t("buttonLabel", { value: choice })}
          className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Icon aria-hidden="true" className="size-4" />
        </PopoverTrigger>
        <PopoverContent>
          <fieldset className="m-0 border-0 p-0">
            <legend id={legendId} className="mb-2 text-sm font-medium">
              {t("label")}
            </legend>
            <RadioGroup value={choice} onValueChange={set} aria-labelledby={legendId}>
              {THEME_VALUES.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={value} data-testid={`theme-option-${value}`} />
                  {t(value)}
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function ThemeSelect() {
  const t = useTranslations("theme");
  const [choice, set] = useThemeChoice();
  const Icon = ICONS[choice];
  return (
    <span data-testid="theme-select-host" className="inline-flex items-center gap-1.5 print:hidden">
      <Select value={choice} onValueChange={set}>
        <SelectTrigger data-testid="theme-select" aria-label={t("label")}>
          <Icon aria-hidden="true" className="size-4" />
          <SelectValue>{t(choice)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {THEME_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
