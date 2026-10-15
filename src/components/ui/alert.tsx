import * as React from "react"
import { cva } from "class-variance-authority"
import { CircleCheckIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * US-175 (NFR-013, FR-049; ADR-019): the design system's Alert, an inline status message. `info`, `success` (an action
 * finished as intended: "Message sent"), `warning` and `danger` each take their status surface, border and icon colour from the tokens; the text stays the page ink, so contrast holds on
 * each surface (TC-499). The icon carries the meaning too, so colour is never the only cue. `danger` is a live
 * `role="alert"`; `info`, `success` and `warning` are `role="status"` unless a `role` is passed (US-177's sign-in and join outcomes pass `alert`). An optional `actions` area sits under the text.
 * An optional `icon` (2026-10-10) replaces the variant's own icon, such as a lock on a frozen-month warning; it keeps the
 * size, the status colour and `aria-hidden`, and must still fit the variant's meaning.
 */
type AlertVariant = "info" | "success" | "warning" | "danger"

const alertVariants = cva("grid grid-cols-[auto_1fr] items-start gap-3 rounded-(--ds-radius-md) border p-4 text-sm text-foreground", {
  variants: {
    variant: {
      info: "border-info-border bg-info-surface [&>svg]:text-info",
      success: "border-success-border bg-success-surface [&>svg]:text-success",
      warning: "border-warning-border bg-warning-surface [&>svg]:text-warning",
      danger: "border-danger-border bg-danger-surface [&>svg]:text-danger",
    },
  },
  defaultVariants: { variant: "info" },
})

const ICONS = { info: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, danger: OctagonAlertIcon } as const

const ALERT_ICON_CLASS = "mt-0.5 size-(--icon-control) shrink-0"

type AlertIconProps = { className?: string; "aria-hidden"?: React.AriaAttributes["aria-hidden"] }
/** A lucide icon component (`LockIcon`) or an element (`<LockIcon />`). */
type AlertIcon = React.ComponentType<AlertIconProps> | React.ReactElement<AlertIconProps>

/** The icon at `icon-control`, decorative: an element keeps its own classes, and the size and `aria-hidden` are added. */
function renderAlertIcon(icon: AlertIcon) {
  if (React.isValidElement<AlertIconProps>(icon)) {
    return React.cloneElement(icon, { "aria-hidden": "true", className: cn(ALERT_ICON_CLASS, icon.props.className) })
  }
  const Icon = icon
  return <Icon aria-hidden="true" className={ALERT_ICON_CLASS} />
}

function alertRole(variant: AlertVariant): "alert" | "status" {
  return variant === "danger" ? "alert" : "status"
}

function Alert({
  variant = "info",
  title,
  actions,
  role,
  icon,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: AlertVariant
  title?: React.ReactNode
  /** Links or buttons shown under the text. */
  actions?: React.ReactNode
  /** Overrides the variant's default role, for a screen whose outcome is announced as an alert whatever its severity (US-177). */
  role?: "alert" | "status"
  /**
   * Replaces the variant's icon (2026-10-10), e.g. `LockIcon` on a warning that a month is frozen. It keeps the size, the
   * status colour and `aria-hidden`. Choose one that still fits the variant: never a check on a warning or danger.
   */
  icon?: AlertIcon
}) {
  return (
    <div
      role={role ?? alertRole(variant)}
      data-slot="alert"
      data-variant={variant}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {renderAlertIcon(icon ?? ICONS[variant])}
      <div data-slot="alert-body" className="grid min-w-0 gap-2">
        {title ? (
          <p data-slot="alert-title" className="font-bold">
            {title}
          </p>
        ) : null}
        {children ? <div data-slot="alert-text">{children}</div> : null}
        {actions ? (
          <div data-slot="alert-actions" className="mt-2 flex flex-wrap gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { Alert, alertRole, alertVariants }
export type { AlertIcon, AlertVariant }
