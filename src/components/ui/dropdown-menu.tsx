"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

/**
 * US-176 (NFR-013; ADR-014, ADR-019): the design system's DropdownMenu on the vendored Radix menu: `role="menu"` with
 * `menuitem` rows, arrow-key movement and Escape handled by Radix. The panel sits on `surface-raised` with the hairline and
 * `shadow-raised` (as the Popover and Dialog do), at `z-dropdown`. A row is hovered with the overlay token; a keyboard-focused
 * row takes the global solid outline, drawn inside the row (Radix items are `tabindex="-1"`, which the global rule skips).
 * No motion at all, so nothing to guard under prefers-reduced-motion.
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
          "z-(--z-dropdown) min-w-55 rounded-(--ds-radius-md) border bg-popover py-2 text-sm text-popover-foreground shadow-(--shadow-raised) outline-none",
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
        "flex min-h-(--control-h-m) w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-foreground no-underline outline-none data-highlighted:bg-hover-overlay focus-visible:outline-solid focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-disabled:opacity-(--opacity-disabled) [&_svg]:size-(--icon-ui) [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
