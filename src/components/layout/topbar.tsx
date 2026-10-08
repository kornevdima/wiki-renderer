import type { ReactNode } from "react";

/**
 * The topbar (US-176, NFR-013): a banner landmark (`data-testid="app-header"`, the id the sign-out and console-link specs
 * scope to) with a leading slot (the brand, or the admin shell's menu button) and the actions at the end. It sticks to the
 * top of the page, with the page gutter on both sides, and the actions wrap onto a second row on a narrow screen instead of
 * running off it. Hidden when printed.
 */
export interface TopbarProps {
  leading?: ReactNode;
  children?: ReactNode;
}

export function Topbar({ leading, children }: TopbarProps) {
  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-(--z-sticky) flex min-h-(--topbar-h) flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-foreground print:hidden lg:px-8"
    >
      {leading}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </header>
  );
}
