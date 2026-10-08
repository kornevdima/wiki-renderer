import * as React from "react"
import { CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * US-174 (NFR-013, FR-049): the one field-error message. The danger-coloured text carries its icon (colour is never the
 * only cue). The field it belongs to points `aria-describedby` at this `id` and sets `aria-invalid`; the message is a
 * live `role="alert"` so a screen reader announces it when the form returns it.
 */
function FieldError({ className, children, ...props }: React.ComponentProps<"p"> & { id: string }) {
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("flex items-start gap-2 text-sm text-danger", className)}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export { FieldError }
