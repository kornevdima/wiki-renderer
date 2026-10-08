"use client";

import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { APP_NAV_ID, useAppShell } from "./app-shell";

/**
 * The topbar's "Open navigation" button (US-176): visible below `bp-lg` only, where the sidebar is a drawer. Its label is the
 * mockup's and stays the same open or closed; `aria-expanded` carries the state. Renders nothing outside an `AppShell`.
 */
export function NavToggle() {
  const t = useTranslations("appShell");
  const shell = useAppShell();
  if (!shell) return null;
  const { open, toggle, setButton } = shell;
  return (
    <button
      ref={setButton}
      type="button"
      data-testid="nav-toggle"
      aria-label={t("openNavigation")}
      aria-expanded={open}
      aria-controls={APP_NAV_ID}
      onClick={toggle}
      className="inline-flex size-(--control-h-m) flex-none items-center justify-center rounded-(--ds-radius-md) text-foreground transition-[background-color] duration-(--duration-fast) ease-standard hover:bg-hover-overlay motion-reduce:transition-none lg:hidden"
    >
      <MenuIcon aria-hidden="true" className="size-(--icon-control)" />
    </button>
  );
}
