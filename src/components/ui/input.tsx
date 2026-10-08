import * as React from "react"
import { cn } from "@/lib/utils"

// US-174 (NFR-013, FR-049; ADR-019): the ESG text field. Hairline border-strong edge (3:1), border-hover on hover, the danger
// token as the border when invalid, opacity-disabled when disabled. Focus is the global solid outline (globals.css): no focus
// halo, ring or border-colour change here (US-200). Motion is colour only, never an outline property (BUG-028).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-(--control-h-s) w-full min-w-0 rounded-lg border border-border-strong bg-background px-4 text-base text-foreground transition-[border-color,background-color] duration-(--duration-base) ease-(--ease-base) outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-muted not-aria-invalid:hover:border-foreground motion-reduce:transition-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-(--opacity-disabled) aria-invalid:border-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
