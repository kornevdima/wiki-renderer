"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import { Kbd } from "@/components/ui/kbd"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

/**
 * US-176 (NFR-013; ADR-014, ADR-019): the design system's DropdownMenu on the vendored Radix menu: `role="menu"` with
 * `menuitem` rows, arrow-key movement and Escape handled by Radix. The panel sits on `surface-raised` with the hairline and
 * `shadow-raised` (as the Popover and Dialog do), at `z-popover`. A row is hovered with the overlay token; a keyboard-focused
 * row takes the global solid outline, drawn inside the row (Radix items are `tabindex="-1"`, which the global rule skips).
 * No motion at all, so nothing to guard under prefers-reduced-motion. Under `@media (pointer: coarse)` every row is at least `hit-min`
 * (44px) high (owner, ruled 2026-10-12).
 */
function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-(--z-popover) min-w-55 rounded-(--ds-radius-md) border bg-popover py-2 text-sm text-popover-foreground shadow-(--shadow-raised) outline-none",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex min-h-(--control-h-m) [@media(pointer:coarse)]:min-h-(--hit-min) w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-foreground no-underline outline-none data-highlighted:bg-hover-overlay focus-visible:outline-solid focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-disabled:opacity-(--opacity-disabled) [&_svg]:size-(--icon-ui) [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * An item's keyboard shortcut at its end (the spec's `esg-menu__hint`): a plain Kbd in `caption`, `ink-secondary`. Show the
 * shortcut the app really binds (brand book, Admin apps › Keyboard), never a single letter.
 */
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return <Kbd variant="plain" data-slot="dropdown-menu-shortcut" className={cn("ms-auto ps-4 text-caption", className)} {...props} />
}

/** A hairline between groups of rows (`esg-menu__divider`). */
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("my-2 h-0 border-t border-border", className)} {...props} />
}

/**
 * A block at the top of a menu that is not a row (2026-10-09, suite-design G-20; `esg-menu__header`): who you are in the
 * suite header's user menu (name, email, teams). Not focusable; the rows after it are.
 */
function DropdownMenuHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-header" className={cn("grid px-4 pt-2 pb-3", className)} {...props} />
}

/**
 * A sub-menu (added 2026-10-12; owner, ruled 2026-10-12: Theme and Language in the narrow user menu, "Theme ▸ Light / Dark / System"). One
 * level only. Where there is room it opens beside its row (Radix). Where there is not (a 390px screen), Radix flips it to the left,
 * half off-screen, so it is then moved under its row, left-aligned with the parent menu and at least as wide as the row, over the rows
 * beneath (`data-[side=left]` translate; checked in Chromium at 390px, 2026-10-12).
 * `DropdownMenuSubTrigger` is a row with a trailing chevron (`aria-haspopup="menu"`; Right Arrow, Enter or Space opens it, Left
 * Arrow or Escape closes it back to the row; `value` shows the current setting after the label); `DropdownMenuSubContent` is the same raised panel as the menu's, at `z-popover`.
 */
function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub {...props} />
}

function DropdownMenuSubTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  /** The current value, shown after the label ("Theme · Dark"), so a person sees the setting without opening it. */
  value?: React.ReactNode
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "flex min-h-(--control-h-m) [@media(pointer:coarse)]:min-h-(--hit-min) w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-foreground outline-none data-highlighted:bg-hover-overlay data-[state=open]:bg-hover-overlay focus-visible:outline-solid focus-visible:-outline-offset-2 [&_svg]:size-(--icon-ui) [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      {value != null ? (
        <span data-slot="dropdown-menu-sub-value" className="min-w-0 truncate text-ink-secondary">
          <span aria-hidden="true">· </span>
          {value}
        </span>
      ) : null}
      <ChevronRightIcon aria-hidden="true" className="ms-auto rtl:rotate-180" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  sideOffset = 2,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-(--z-popover) min-w-(--radix-popper-anchor-width) max-w-[calc(100vw-var(--space-16))] rounded-(--ds-radius-md) border bg-popover py-2 text-sm text-popover-foreground shadow-(--shadow-raised) outline-none",
          // Radix opens a sub-menu beside its row and flips it to the left when the right does not fit, which on a 390px screen
          // leaves it half off-screen. When it flips, move it under its row instead, left-aligned with the parent menu.
          "data-[side=left]:translate-x-[calc(100%+var(--space-8)/4)] data-[side=left]:translate-y-(--radix-popper-anchor-height)",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

/** A choice among exclusive options inside a menu (`menuitemradio`): the chosen row carries a check, `aria-checked` says so. */
function DropdownMenuRadioGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "flex min-h-(--control-h-m) [@media(pointer:coarse)]:min-h-(--hit-min) w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-foreground outline-none data-highlighted:bg-hover-overlay focus-visible:outline-solid focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-disabled:opacity-(--opacity-disabled)",
        className
      )}
      {...props}
    >
      <span className="size-(--icon-ui) shrink-0">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-(--icon-ui) text-primary-text" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuHeader, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem }
