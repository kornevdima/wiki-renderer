import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * US-175 (NFR-013, FR-049; ADR-019): the design system's EmptyState, an icon, a title, optional text and optional actions.
 * `compact` sits inside a table cell or a small panel; `full` is the whole-screen size (its consumers are US-178). The icon
 * is decorative (the title says it). The title is a paragraph unless `titleAs` names a heading level, so a table cell adds
 * no stray heading to the page outline.
 *
 * A single-action screen (ruled 2026-10-09, suite-design G-24) is the same parts for the end of a flow or a stop, with one
 * action and at most one quiet link: `placement="page"` inside EntryLayout's task (no padding of its own), `"region"` filling
 * a shell's content area, centred; `tone` colours the icon circle only; `detail` is a literal the person needs (the address
 * they asked for), in Lilex on one line.
 */
type EmptyStateSize = "compact" | "full"
type EmptyStatePlacement = "page" | "region"
type EmptyStateTone = "neutral" | "brand" | "success" | "warning" | "danger"

/** The icon circle per tone: the ground, the icon colour and no hairline (the tone carries the edge). */
const TONES: Record<EmptyStateTone, string> = {
  neutral: "border bg-muted text-muted-foreground",
  brand: "bg-surface-selected text-primary-text",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
}

const PLACEMENTS: Record<EmptyStatePlacement, string> = {
  page: "p-0",
  region: "min-h-[calc(100dvh-var(--topbar-h)-var(--space-120))] content-center",
}

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
  placement,
  tone = "neutral",
  detail,
  detailIcon,
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
  /** A single-action screen's placement; omit for an empty list, table or panel. */
  placement?: EmptyStatePlacement
  /** Colours the icon circle only; `neutral` by default. */
  tone?: EmptyStateTone
  /** A literal shown on one line in Lilex (the address asked for), after the text. */
  detail?: React.ReactNode
  /** An icon before the detail (a link icon for an address). */
  detailIcon?: React.ReactNode
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
      data-placement={placement}
      data-tone={tone === "neutral" ? undefined : tone}
      className={cn("grid justify-items-center text-center text-foreground", s.root, placement && PLACEMENTS[placement], className)}
      {...props}
    >
      <span
        data-slot="empty-state-icon"
        aria-hidden="true"
        className={cn("inline-flex items-center justify-center rounded-full", TONES[tone], s.icon)}
      >
        {icon}
      </span>
      <Title data-slot="empty-state-title" data-testid={titleTestId} className={cn(titleSize, "leading-6 font-bold text-foreground", titleClassName)}>
        {title}
      </Title>
      {text ? (
        <p data-slot="empty-state-text" className={cn("text-sm text-muted-foreground", placement ? "max-w-[40ch]" : "max-w-[44ch]")}>
          {text}
        </p>
      ) : null}
      {detail ? (
        <p
          data-slot="empty-state-detail"
          className="m-0 flex max-w-full min-w-0 items-center gap-2 rounded-(--ds-radius-md) border border-border bg-muted px-3 py-2 font-mono text-caption text-ink-secondary [font-variant-ligatures:none] [&>svg]:size-(--icon-control) [&>svg]:flex-none"
        >
          {detailIcon}
          <span className="truncate">{detail}</span>
        </p>
      ) : null}
      {actions ? (
        <div data-slot="empty-state-actions" className={cn("flex flex-wrap items-center justify-center gap-3", size === "full" && "mt-2")}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }
export type { EmptyStatePlacement, EmptyStateSize, EmptyStateTone }
