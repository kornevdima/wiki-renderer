"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { KBD_PLAIN_CLASS, Kbd } from "@/components/ui/kbd"

/**
 * The Tooltip (spec: project/components/Tooltip, accepted 2026-10-07) on Radix Tooltip. It names a control or adds a one-line
 * hint, never anything a person must act on. The raised look (ruled 2026-10-07): `surface-raised`, `border` hairline,
 * `radius-md`, `shadow-raised`, `caption` in `ink`, `space-8` x `space-12`, at most 280px wide, no arrow, `z-popover`.
 *
 * Behaviour (WCAG 1.4.13): above the trigger, `space-8` away, flipping below and staying in the viewport; opens after a 500ms
 * rest of the pointer and at once on keyboard focus; one open at a time (the provider); hoverable (Radix's pointer grace
 * area); hides on leave, blur and Escape, without moving focus. Fades in over `duration-fast`, not under reduced motion.
 *
 * Two kinds, because a tooltip never names a control on its own:
 * - `hint` (default for `TooltipContent`): adds to the name, linked from the trigger with `aria-describedby`.
 * - `label`: repeats the trigger's own `aria-label`, so it is `aria-hidden` and not linked (it would be read twice).
 * `TooltipIconButton` is the icon-button case and always uses `label`: its `label` is both the button's `aria-label` and the
 * tooltip text, so the accessible name never depends on the tooltip.
 */
export type TooltipKind = "hint" | "label"

export const TOOLTIP_DELAY_MS = 500
export const TOOLTIP_CONTENT_CLASS =
  "z-(--z-popover) box-border max-w-70 rounded-(--ds-radius-md) border border-border bg-popover px-3 py-2 text-caption text-ink shadow-(--shadow-raised) " +
  "opacity-100 motion-safe:transition-opacity motion-safe:duration-(--duration-fast) motion-safe:ease-standard motion-safe:starting:opacity-0"
/** The shortcut after the text: the plain Kbd (`ink-secondary`, no chip), `space-8` before it (Kbd, 2026-10-08). */
export const TOOLTIP_KEY_CLASS = cn("ms-2", KBD_PLAIN_CLASS)

/** The ARIA wiring for a kind: what the trigger and the content each get. Pure, so it is unit-tested. */
export function tooltipAria(kind: TooltipKind): {
  trigger: { "aria-describedby"?: undefined }
  content: { "aria-hidden"?: true }
} {
  // `hint` keeps Radix's own wiring (the trigger is described by the open tooltip). `label` removes it: the explicit undefined
  // overrides Radix's `aria-describedby`, which it spreads before the trigger's props.
  return kind === "label" ? { trigger: { "aria-describedby": undefined }, content: { "aria-hidden": true } } : { trigger: {}, content: {} }
}

const KindContext = React.createContext<TooltipKind>("hint")

/** One per app (or per tooltip): the 500ms delay, and moving between triggers opens the next one at once. */
function TooltipProvider({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}

function Tooltip({
  kind = "hint",
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & { kind?: TooltipKind }) {
  return (
    <TooltipProvider>
      <KindContext.Provider value={kind}>
        <TooltipPrimitive.Root data-slot="tooltip" {...props} />
      </KindContext.Provider>
    </TooltipProvider>
  )
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const kind = React.useContext(KindContext)
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} {...tooltipAria(kind).trigger} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const kind = React.useContext(KindContext)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-kind={kind}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(TOOLTIP_CONTENT_CLASS, className)}
        {...props}
        {...tooltipAria(kind).content}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/** A keyboard shortcut after the text ("Search  ⌘K"): a plain Kbd, `ink-secondary`. */
function TooltipShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return <Kbd variant="plain" data-slot="tooltip-key" className={cn("ms-2", className)} {...props} />
}

/**
 * An icon-only button with its name as a tooltip: `label` is the button's `aria-label` and the tooltip's text, and the tooltip
 * is `aria-hidden` (kind `label`). Pass `shortcut` to show a key after the text. Never use it on a disabled button: the tooltip
 * cannot reach keyboard users there, so say why the action is unavailable in text near it.
 */
function TooltipIconButton({
  label,
  shortcut,
  children,
  variant = "ghost",
  size = "icon",
  side,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label"> & {
  label: string
  shortcut?: string
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
}) {
  return (
    <Tooltip kind="label">
      <TooltipTrigger asChild>
        <Button aria-label={label} variant={variant} size={size} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut ? <TooltipShortcut>{shortcut}</TooltipShortcut> : null}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipContent, TooltipIconButton, TooltipProvider, TooltipShortcut, TooltipTrigger }
