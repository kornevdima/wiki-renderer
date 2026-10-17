"use client";

import { Children, Fragment, type ReactNode } from "react";

import { ThemeMenuRow, type ThemeControlProps } from "@/components/layout/theme-control";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

/**
 * The sections the SuiteHeader's account menu and the SettingsMenu share (ruled 2026-10-17: the settings menu "opens the same
 * drawer as avatar menu"): the Theme group (`ThemeMenuRow`, inline, never a sub-menu), then the app's own rows (an inline
 * choice such as Language, not a sub-menu). One separator after each section that shows; with `endSeparator` the last one is
 * followed by a separator too, because rows follow it (the SuiteHeader's Admin console, profile and Sign out). Without it the
 * sections end the menu (the SettingsMenu). A missing section adds nothing, not an empty section or a double separator.
 * It must sit inside a `DropdownMenuContent`, which mounts its children only when the menu opens.
 */
export interface MenuSectionsProps {
  /** The Theme group. Omit it for none. */
  theme?: ThemeControlProps;
  /** The app's own rows (DropdownMenu children). `false`, `null`, `undefined` and `[]` add nothing. */
  items?: ReactNode;
  /** A separator after the last section, for rows that follow it. Default false. */
  endSeparator?: boolean;
}

export function MenuSections({ theme, items, endSeparator = false }: MenuSectionsProps) {
  const sections: ReactNode[] = [];
  if (theme) sections.push(<ThemeMenuRow key="theme" {...theme} />);
  if (Children.toArray(items).length > 0) sections.push(<Fragment key="items">{items}</Fragment>);
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={index}>
          {section}
          {index < sections.length - 1 || endSeparator ? <DropdownMenuSeparator /> : null}
        </Fragment>
      ))}
    </>
  );
}
