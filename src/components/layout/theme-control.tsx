"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useId } from "react";

import { HIT_AREA_COARSE_CLASS } from "@/components/ui/hit-area";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * The Light / Dark / System control (`project/components/ThemeControl`; owner, ruled 2026-10-15 "Picker into suite header first"
 * and 2026-10-16 "Shared across apps"; US-271). Controlled and storage-free: the app passes the `value`, hears the pick in
 * `onValueChange`, and keeps the choice itself (a cookie, an account), because only the app's root layout can paint it before
 * the first frame. Two forms of one choice:
 *
 * - `ThemeControl`, the bar form: an icon button showing the current choice (sun, moon or monitor) that opens a popover with a
 *   radio group. Arrow keys move and select, Esc closes and returns focus to the button.
 * - `ThemeMenuRow`, the menu form: an inline group for the account menu (inside the SuiteHeader at every width; elsewhere below `bp-md`) (owner, ruled 2026-10-16, "Choices inline",
 *   replacing the 2026-10-12 sub-menu, which opened over Sign out): a "Theme" label row, then Light, Dark and System as
 *   `menuitemradio` rows, no sub-menu. A pick fires `onValueChange` and closes the menu. It must sit inside a `DropdownMenuContent`.
 *
 * Every word comes from `labels`; the button's name is "{label}: {current}".
 */
export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export interface ThemeControlLabels {
  /** The control's name: "Theme". */
  label: string;
  light: string;
  dark: string;
  system: string;
}

export interface ThemeControlProps {
  value: ThemeChoice;
  onValueChange: (value: ThemeChoice) => void;
  labels: ThemeControlLabels;
}

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;

/** Anything that is not one of the three choices counts as System, as an app's stored value may be stale or hand-edited. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? "system";
}

/** The button's accessible name: "Theme: Dark". */
export function themeButtonLabel(labels: ThemeControlLabels, value: ThemeChoice): string {
  return `${labels.label}: ${labels[value]}`;
}

const ACTION_BUTTON =
  "inline-flex size-(--control-h-m) items-center justify-center rounded-(--ds-radius-md) text-foreground transition-[background-color] duration-(--duration-fast) ease-standard hover:bg-hover-overlay aria-expanded:bg-hover-overlay motion-reduce:transition-none [&_svg]:size-5 " +
  HIT_AREA_COARSE_CLASS;

export function ThemeControl({ value, onValueChange, labels }: ThemeControlProps) {
  const legendId = useId();
  const Icon = ICONS[value];
  return (
    <span data-testid="theme-control-host" className="print:hidden">
      <Popover>
        <PopoverTrigger type="button" data-testid="theme-control" aria-label={themeButtonLabel(labels, value)} className={ACTION_BUTTON}>
          <Icon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" aria-labelledby={legendId} className="min-w-[220px] p-4">
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend id={legendId} className="mb-3 text-label-form text-foreground">
              {labels.label}
            </legend>
            <RadioGroup value={value} onValueChange={(next) => onValueChange(parseThemeChoice(next))} className="gap-3">
              {THEME_CHOICES.map((choice) => (
                <label key={choice} className="flex cursor-pointer items-center gap-2 text-small text-foreground">
                  <RadioGroupItem value={choice} data-testid={`theme-option-${choice}`} />
                  {labels[choice]}
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function ThemeMenuRow({ value, onValueChange, labels }: ThemeControlProps) {
  const labelId = useId();
  return (
    <>
      <DropdownMenuLabel id={labelId}>{labels.label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(parseThemeChoice(next))} aria-labelledby={labelId} data-testid="narrow-theme">
        {THEME_CHOICES.map((choice) => (
          <DropdownMenuRadioItem key={choice} value={choice} data-testid={`narrow-theme-${choice}`}>
            {labels[choice]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
