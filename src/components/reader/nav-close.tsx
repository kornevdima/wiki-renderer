"use client";

import { XIcon } from "lucide-react";

import { useAppShell } from "@/components/layout/app-shell";

/**
 * The off-canvas sidebar's own "Close navigation" button (US-222, SA-MOD Reader UI and print E3-D11). The installed `AppShell`
 * has no close control and is not edited in the app (ADR-020), so this app-owned button calls the shell's `toggle` while the
 * drawer is open; the shell's own close then returns focus to the menu button. Shown below `bp-lg` only (above it the sidebar is
 * a static column), and never in print. Renders nothing outside an `AppShell`.
 */
export function NavClose({ label }: { label: string }) {
  const shell = useAppShell();
  if (!shell) return null;
  return (
    <button
      type="button"
      data-testid="nav-close"
      aria-label={label}
      onClick={shell.toggle}
      className="absolute right-4 top-1/2 inline-flex size-(--control-h-m) -translate-y-1/2 items-center justify-center rounded-(--ds-radius-md) text-muted-foreground transition-[background-color,color] duration-(--duration-fast) ease-standard hover:bg-hover-overlay hover:text-foreground motion-reduce:transition-none lg:hidden print:hidden"
    >
      <XIcon aria-hidden="true" className="size-(--icon-control)" />
    </button>
  );
}
