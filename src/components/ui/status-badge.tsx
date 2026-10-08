import * as React from "react"
import { cva } from "class-variance-authority"
import { CircleCheckIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * US-202 (NFR-013, FR-003 via CR-006; ADR-019): the design system's StatusBadge, a compact status label. A status is never
 * shown by colour alone: it always carries an icon and a word. The icon is decorative (`aria-hidden`); the word is the
 * accessible text. The no-variant badge is `neutral` and takes the `info` tokens and icon. Colours come from the status tokens
 * (text, surface, border); contrast is TC-499's.
 */
type StatusBadgeVariant = "neutral" | "success" | "warning" | "danger"

const statusBadgeVariants = cva(
  "inline-flex items-center gap-2 rounded-(--ds-radius-sm) border px-(--pad-tag-x) py-(--pad-tag-y) text-xs leading-4 font-normal whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-info-border bg-info-surface text-info",
        success: "border-success-border bg-success-surface text-success",
        warning: "border-warning-border bg-warning-surface text-warning",
        danger: "border-danger-border bg-danger-surface text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
)

const STATUS_ICONS = { neutral: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, danger: OctagonAlertIcon } as const

function StatusBadge({
  variant = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { variant?: StatusBadgeVariant }) {
  const Icon = STATUS_ICONS[variant]
  return (
    <span data-slot="status-badge" data-variant={variant} className={cn(statusBadgeVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" className="size-(--icon-status) shrink-0" />
      {children}
    </span>
  )
}

export { StatusBadge, statusBadgeVariants, STATUS_ICONS }
export type { StatusBadgeVariant }
