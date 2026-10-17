"use client";

import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MenuSections } from "@/components/layout/menu-sections";
import type { ThemeControlProps } from "@/components/layout/theme-control";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HIT_AREA_COARSE_CLASS } from "@/components/ui/hit-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The SettingsMenu (`project/components/SettingsMenu`; owner, ruled 2026-10-17: "I want to have some menu to open. it can be icon
 * but that opens the same drawer as avatar menu. we need to place theme and language selection in this menu.", US-286): the
 * SuiteHeader's account menu without a person, for an app with no sign-in (the local wiki renderer). An icon button at the end
 * of the Topbar (pass it as the Topbar's `children`) opens a DropdownMenu with the same look: the Theme group, a separator, then
 * the app's own `items` (a Language inline radio group). No header block, Admin, profile or Sign out. Presentational and
 * storage-free: the app keeps the choices. The content mounts only when the menu opens.
 *
 * `label` is the button's accessible name, its tooltip and the menu's name ("Settings"): every word is the app's.
 */
export interface SettingsMenuProps {
  /** The button's name, tooltip and the menu's name: "Settings". */
  label: string;
  /** The Theme group, inline. Omit it for none. */
  theme?: ThemeControlProps;
  /** The app's own rows (DropdownMenu children) after the Theme group. A choice is an inline `DropdownMenuLabel` + `DropdownMenuRadioGroup`, not a sub-menu. */
  items?: ReactNode;
}

const BAR_ICON_BUTTON =
  "inline-flex size-(--control-h-m) items-center justify-center rounded-(--ds-radius-md) text-foreground transition-[background-color] duration-(--duration-fast) ease-standard hover:bg-hover-overlay aria-expanded:bg-hover-overlay motion-reduce:transition-none [&_svg]:size-5 print:hidden " +
  HIT_AREA_COARSE_CLASS;

export function SettingsMenu({ label, theme, items }: SettingsMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip kind="label">
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" data-testid="settings-menu" aria-label={label} className={BAR_ICON_BUTTON}>
              <SettingsIcon aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent aria-label={label}>
        <MenuSections theme={theme} items={items} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
