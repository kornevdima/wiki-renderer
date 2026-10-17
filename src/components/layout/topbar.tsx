import type { ReactNode } from "react";

/**
 * The topbar (US-176, NFR-013): a banner landmark (`data-testid="app-header"`, the id the sign-out and console-link specs
 * scope to) with a leading slot (the brand, or the admin shell's menu button) and the actions at the end. It sticks to the
 * top of the page, with the page gutter on both sides. Hidden when printed.
 *
 * Narrow screens (added 2026-10-12, R2; owner, ruled 2026-10-12, superseding the overflow menu of that morning; spec: Topbar,
 * "Narrow"): from `bp-md` (768px) up nothing changes, and the actions wrap onto a second row rather than run off the screen.
 * Below `bp-md` the bar is one `topbar-h` row: `leading` (the navigation button, and the app's search as an icon that opens the
 * palette), then `children` (the user menu). The `secondary` actions (help, theme, language, a demo control) are hidden with CSS
 * below `bp-md` (`max-md:hidden`), and the app moves them into the user menu there (`UserMenu`'s `narrowItems`).
 * `actions` (v47 work) are primary actions that stay visible at every width (the home bar's "Admin console" button). They render
 * in DOM order after `leading` and before `secondary`, so the focus order matches the visual order (WCAG 2.4.3): leading,
 * `actions`, `secondary`, `children`. Without the prop the markup is unchanged. Like `SuiteHeader`'s `actions`, they are
 * extra controls before the user menu. Keep them compact: below `bp-md` the bar is one non-wrapping row.
 * The bar is CSS only: no script and no media query in it, so a server render and the first client render are identical and nothing
 * flashes. The menu content is chosen when it opens (`UserMenu` reads the viewport then, and its content mounts only on open).
 */
export interface TopbarProps {
  leading?: ReactNode;
  /** Primary actions that stay visible at every width; rendered before `secondary` (DOM order: leading, actions, secondary, children). */
  actions?: ReactNode;
  /** The actions that always stay in the bar (the user menu). */
  children?: ReactNode;
  /** Inline controls shown from `bp-md`, before `children`; hidden below it. Offer the same actions in the user menu's `narrowItems`. */
  secondary?: ReactNode;
}

export function Topbar({ leading, children, secondary, actions }: TopbarProps) {
  return (
    <header
      data-testid="app-header"
      data-slot="topbar"
      className="sticky top-0 z-(--z-shell) flex min-h-(--topbar-h) flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-foreground max-md:h-(--topbar-h) max-md:flex-nowrap max-md:py-0 print:hidden lg:px-8"
    >
      {leading}
      <div data-slot="topbar-actions" className="ml-auto flex flex-wrap items-center justify-end gap-2 max-md:flex-nowrap">
        {actions}
        {secondary != null && secondary !== false ? (
          <div data-slot="topbar-secondary" className="flex flex-wrap items-center justify-end gap-2 max-md:hidden">
            {secondary}
          </div>
        ) : null}
        {children}
      </div>
    </header>
  );
}
