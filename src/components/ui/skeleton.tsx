import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * US-181 (NFR-013, FR-049; ADR-019): the design system's loading placeholder (`.esg-table__skeleton`): a `track` bar the height
 * of a line of small text, with the `esg-skeleton` pulse under `motion-safe:` only, so a viewer who prefers reduced motion
 * sees a still bar. A bar is decorative (`aria-hidden`); the status text beside it names what is loading. `SkeletonStack` is the
 * three-bar block a dialog body shows while its data loads.
 */
export const SKELETON_BAR_CLASS =
  "block h-3 w-[70%] rounded-(--ds-radius-sm) bg-track motion-safe:animate-[esg-skeleton_1.4s_ease-in-out_infinite]"

function SkeletonBar({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="skeleton-bar" aria-hidden="true" className={cn(SKELETON_BAR_CLASS, className)} {...props} />
}

const STACK_WIDTHS = ["w-[80%]", "w-[55%]", "w-[65%]"] as const

function SkeletonStack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton-stack" aria-hidden="true" className={cn("grid gap-4", className)} {...props}>
      {STACK_WIDTHS.map((width) => (
        <SkeletonBar key={width} className={width} />
      ))}
    </div>
  )
}

export { SkeletonBar, SkeletonStack }
