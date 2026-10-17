"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Select as SelectPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/**
 * The open list (US-285, owner 2026-10-17): never taller than the room Radix reports below or above the trigger
 * (`--radix-select-content-available-height`), so a long list (164 teams) scrolls inside instead of running off the screen.
 * Applies to `position="popper"` (the default); `item-aligned` does not set the variable. Radix's viewport already scrolls (`overflow: hidden auto`); the cap is what makes it. The 100dvh fallback is for a render outside Radix.
 */
const SELECT_CONTENT_CLASS =
  "relative z-(--z-popover) max-h-(--radix-select-content-available-height,100dvh) min-w-32 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-(--shadow-raised)"

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          SELECT_CONTENT_CLASS,
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

/**
 * A group of options with an optional label (SelectLabel). Radix names the group by its label, so a screen reader hears
 * the group's name when focus enters it.
 */
function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

/** A group's caption (2026-10-10; the DropdownMenu's `esg-menu__label`): `caption` in `ink-secondary`, not an option. */
function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn("px-2 pt-2 pb-1 text-caption text-ink-secondary", className)} {...props} />
}

/**
 * A hairline between groups of options (2026-10-10; the DropdownMenu's separator, `esg-menu__divider`): a `border`
 * hairline with `space-8` above and below, edge to edge across the list. Decorative: Radix renders it `aria-hidden`, and
 * the arrow keys skip it. Use it to set apart an option that is not one of the list's values, such as "Reset to my real role".
 */
function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("-mx-1 my-2 h-0 border-t border-border", className)} {...props} />
}

export { SELECT_CONTENT_CLASS, Select, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator }
