"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatShortcut, usePlatform, type Platform, type ShortcutSpec } from "@/lib/keyboard"

/**
 * The ESG Kbd (spec: project/components/Kbd, added 2026-10-08): a keyboard key as a `<kbd>`.
 * - `chip` (default): a `radius-sm` chip on `surface-muted` with a `border` hairline, `caption` text in `ink-secondary`, at
 *   least `avatar-xs` wide. The Topbar's search hint, the CommandPalette's option hints and footer, the ShortcutsSheet.
 * - `plain`: the key as text in `ink-secondary`, no chip. The Tooltip's shortcut and the DropdownMenu's hint.
 * Figtree, never the browser's monospace for `<kbd>`.
 */
export type KbdVariant = "chip" | "plain"

export const KBD_CLASS =
  "inline-flex min-w-(--avatar-xs) items-center justify-center rounded-(--ds-radius-sm) border border-border bg-surface-muted px-2 font-sans text-caption font-normal whitespace-nowrap text-ink-secondary tabular-nums not-italic"
export const KBD_PLAIN_CLASS = "font-sans font-normal whitespace-nowrap text-ink-secondary tabular-nums not-italic"
/** Keys pressed together or in turn ("Tab" or "Shift Tab"): chips `space-8 / 2` apart, separators in `ink-secondary`. */
export const KBD_GROUP_CLASS = "inline-flex flex-wrap items-center gap-1 text-caption text-ink-secondary"

function Kbd({ className, variant = "chip", ...props }: React.ComponentProps<"kbd"> & { variant?: KbdVariant }) {
  return (
    <kbd
      data-slot="kbd"
      data-variant={variant}
      className={cn(variant === "plain" ? KBD_PLAIN_CLASS : KBD_CLASS, className)}
      {...props}
    />
  )
}

/**
 * A shortcut from `@/lib/keyboard` in the viewer's form: "⌘K" on macOS and iOS, "Ctrl K" elsewhere. On the server and during
 * hydration it shows the "Ctrl" form (`usePlatform`), then the real one. Pass `platform` to fix it (docs, tests).
 */
function KbdShortcut({
  shortcut,
  platform,
  ...props
}: Omit<React.ComponentProps<typeof Kbd>, "children"> & { shortcut: ShortcutSpec; platform?: Platform }) {
  const detected = usePlatform()
  return <Kbd {...props}>{formatShortcut(shortcut, platform ?? detected)}</Kbd>
}

/** A row of keys with separators between them: `<KbdGroup><Kbd>Tab</Kbd><span>or</span><Kbd>Shift Tab</Kbd></KbdGroup>`. */
function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="kbd-group" className={cn(KBD_GROUP_CLASS, className)} {...props} />
}

export { Kbd, KbdGroup, KbdShortcut }
