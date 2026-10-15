"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive, ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import {
  COUNT_CLASS,
  LIST_CLASS,
  PANEL_CLASS,
  SEGMENT_CLASS,
  TABS_CLASS,
  TAB_CLASS,
  TAB_LINK_CLASS,
  type TabsVariant,
} from "@/components/ui/tab-classes"

/**
 * Tabs (spec: project/components/Tabs) on Radix Tabs: the WAI-ARIA APG tabs pattern with automatic activation (Left / Right
 * move and select, Home / End jump; only the selected tab is a tab stop; each tab `aria-controls` its panel and the panel is
 * `aria-labelledby` it and `tabindex="0"`). Two looks:
 * - `underline` (default): `control-h-s` tabs in `ink-secondary`, the selected one bold `ink` with a 2px `primary` underline,
 *   `border-strong` on hover, an optional count chip (`surface-muted`, and `surface-selected` + `primary-text` when selected).
 * - `pills`: the segmented look on `surface-muted` with a hairline; `control-h-m` tabs; the selected one is a `surface-raised`
 *   chip with `shadow-button`. Use it for filters such as a period.
 *
 * `SegmentedControl` is the pills look on Radix ToggleGroup (owner ruling 2026-10-07: pills are the segmented control), for a
 * mode switch that does not swap a panel ("Select / Create", "Count / %"): one value, always set (a click on the selected
 * option does not clear it). Colour transitions take `duration-base`, none under prefers-reduced-motion.
 *
 * Server rendering under a strict CSP: Radix Tabs and ToggleGroup write `style="outline:none"` (the roving-focus group) and
 * `style="animation-duration:0s"` (the panel) into the server-rendered HTML, which `style-src` without `'unsafe-inline'`
 * refuses (`ssr-inline-style.test.ts` measures it). Use these for client-only screens. For tabs that are routes, use `TabNav`
 * (links, no Radix). The class strings live in `tab-classes.ts`, which a server component can import; they are re-exported here.
 */
export { COUNT_CLASS, LIST_CLASS, PANEL_CLASS, SEGMENT_CLASS, TABS_CLASS, TAB_CLASS, TAB_LINK_CLASS }
export type { TabsVariant }

const TabsContext = React.createContext<TabsVariant>("underline")

function Tabs({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & { variant?: TabsVariant }) {
  return (
    <TabsContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        activationMode="automatic"
        className={cn(TABS_CLASS, className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const variant = React.useContext(TabsContext)
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(LIST_CLASS[variant], className)} {...props} />
}

function TabsTrigger({
  className,
  children,
  count,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** A count read as part of the tab name ("Candidates 57"); add visually hidden text if the number needs a word. */
  count?: number | string
}) {
  const variant = React.useContext(TabsContext)
  return (
    <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("group/tab", TAB_CLASS[variant], className)} {...props}>
      {children}
      {count === undefined ? null : (
        <span data-slot="tabs-count" className={COUNT_CLASS}>
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn(PANEL_CLASS, className)} {...props} />
}

/** A single-select change that would clear the value (a click on the selected option) is ignored: one option is always set. */
export function nextSegmentValue(current: string, next: string): string {
  return next === "" ? current : next
}

function SegmentedControl({
  className,
  value,
  onValueChange,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ToggleGroupPrimitive.Root>, "type" | "value" | "defaultValue" | "onValueChange"> & {
  value: string
  onValueChange: (value: string) => void
  /** The control's name ("View", "Show as"): required, there is no visible legend. */
  "aria-label": string
}) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented-control"
      type="single"
      value={value}
      onValueChange={(next: string) => {
        const resolved = nextSegmentValue(value, next)
        if (resolved !== value) onValueChange(resolved)
      }}
      className={cn(LIST_CLASS.pills, className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  )
}

function SegmentedControlItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return <ToggleGroupPrimitive.Item data-slot="segmented-control-item" className={cn(SEGMENT_CLASS, className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, SegmentedControl, SegmentedControlItem }
