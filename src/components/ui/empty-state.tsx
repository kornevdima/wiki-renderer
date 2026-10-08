import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * US-175 (NFR-013, FR-049; ADR-019): the design system's EmptyState, an icon, a title, optional text and optional actions.
 * `compact` sits inside a table cell or a small panel; `full` is the whole-screen size (its consumers are US-178). The icon
 * is decorative (the title says it). The title is a paragraph unless `titleAs` names a heading level, so a table cell adds
 * no stray heading to the page outline.
 */
type EmptyStateSize = "compact" | "full"

const SIZES: Record<EmptyStateSize, { root: string; icon: string }> = {
  compact: {
    root: "gap-2 px-4 py-8",
    icon: "size-(--control-h-m) [&_svg]:size-(--icon-control)",
  },
  full: {
    root: "gap-3 px-6 py-12",
    icon: "size-(--icon-feature) [&_svg]:size-6",
  },
}

function EmptyState({
  size = "full",
  icon,
  title,
  text,
  actions,
  titleAs: Title = "p",
  titleTestId,
  titleClassName,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  size?: EmptyStateSize
  icon: React.ReactNode
  title: React.ReactNode
  text?: React.ReactNode
  actions?: React.ReactNode
  titleAs?: "p" | "h1" | "h2" | "h3"
  titleTestId?: string
  /** Merged over the title's default size (a screen that draws the mockup's 28/36 heading-m; US-195). */
  titleClassName?: string
}) {
  const s = SIZES[size]
  // A compact title in a cell, dialog or list is `body-strong` (16/24); it is `title` (20/24) in the full size, and when it is
  // the page's own `h1` (US-212 R7).
  const titleSize = size === "compact" && Title !== "h1" ? "text-base" : "text-xl"
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn("grid justify-items-center text-center text-foreground", s.root, className)}
      {...props}
    >
      <span
        data-slot="empty-state-icon"
        aria-hidden="true"
        className={cn("inline-flex items-center justify-center rounded-full border bg-muted text-muted-foreground", s.icon)}
      >
        {icon}
      </span>
      <Title data-slot="empty-state-title" data-testid={titleTestId} className={cn(titleSize, "leading-6 font-bold text-foreground", titleClassName)}>
        {title}
      </Title>
      {text ? (
        <p data-slot="empty-state-text" className="max-w-[44ch] text-sm text-muted-foreground">
          {text}
        </p>
      ) : null}
      {actions ? (
        <div data-slot="empty-state-actions" className={cn("flex flex-wrap justify-center gap-3", size === "full" && "mt-2")}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateSize }
