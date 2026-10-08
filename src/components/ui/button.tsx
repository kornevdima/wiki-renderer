import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// US-174 (NFR-013, FR-049; ADR-019): the ESG button states, every value from a token in globals.css. Filled buttons lift with
// shadow-button / -hover / -active and darken with a shade over the fill (hover = shade-hover, pressed = shade-active); the
// shade is a background-image layer, so the gradient of `brand` stays under it. Motion is colour, background, border and shadow
// only: never `transition-all`, never an outline property (BUG-028), and none under prefers-reduced-motion.
const FILLED =
  "not-disabled:active:shadow-(--shadow-button-active)"
// Rest and hover lift by size: the `sm` size is flat at rest and takes shadow-button only on hover (the mockup's .esg-btn--sm).
const LIFT = "shadow-(--shadow-button) not-disabled:hover:shadow-(--shadow-button-hover)"
const LIFT_SM = "shadow-none not-disabled:hover:shadow-(--shadow-button)"
const FILLED_VARIANTS = ["default", "solid", "brand", "danger"] as const
const NOT_SM = ["default", "xs", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const
// The filled variants carry no border (BUG-036, the mockup's .esg-btn{border:0}): the fill reaches the edge. Border and
// bg-clip-padding live only on the variants that draw or reserve an edge, so no filled variant has to cancel them.
const EDGE = "border bg-clip-padding"
const SOLID = `${FILLED} bg-primary text-primary-foreground not-disabled:hover:bg-(image:--shade-hover-fill) not-disabled:active:bg-(image:--shade-active-fill)`

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-bold whitespace-nowrap transition-[background-color,background-image,box-shadow,border-color] duration-(--duration-button) ease-standard outline-none select-none motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) disabled:shadow-none aria-busy:cursor-progress aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: SOLID,
        solid: SOLID,
        // The gradient call to action: one per view, sign-in only (never in admin UI).
        brand: `${FILLED} bg-primary bg-(image:--gradient-brand) text-primary-foreground not-disabled:hover:bg-(image:--brand-hover-fill) not-disabled:active:bg-(image:--brand-active-fill)`,
        // Destructive confirm only: danger-fill with an on-danger label in both themes.
        danger: `${FILLED} bg-danger-fill text-on-danger not-disabled:hover:bg-(image:--shade-hover-fill) not-disabled:active:bg-(image:--shade-active-fill)`,
        outline:
          `${EDGE} border-border-strong bg-transparent text-foreground not-disabled:not-aria-invalid:hover:border-foreground not-disabled:hover:bg-hover-overlay aria-expanded:bg-hover-overlay`,
        secondary:
          `${EDGE} border-transparent bg-secondary text-secondary-foreground not-disabled:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground`,
        ghost: `${EDGE} border-transparent text-foreground not-disabled:hover:bg-hover-overlay aria-expanded:bg-hover-overlay`,
        link: `${EDGE} border-transparent text-primary-text underline-offset-4 not-disabled:hover:underline`,
      },
      size: {
        default:
          "h-(--control-h-s) px-(--pad-button-s-x) text-sm has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--control-h-m) px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-(--control-h-l) px-(--pad-button-x) text-base has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    compoundVariants: [
      { variant: [...FILLED_VARIANTS], size: [...NOT_SM], className: LIFT },
      { variant: [...FILLED_VARIANTS], size: "sm", className: LIFT_SM },
      // US-209 (BUG-041): the gradient label is `label-large` (18.67/24 bold, the 14pt-bold large-text threshold), so the 3:1 bar applies to it on the gradient.
      { variant: "brand", size: "lg", className: "text-label-large" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
