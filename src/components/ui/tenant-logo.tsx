import * as React from "react"

import { avatarInitials } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/**
 * The design system's TenantLogo (`project/components/TenantLogo`): the mark of an app or a tenant workspace in the brand
 * lockup. It is the tenant's own image, or its initials in white on one of three dark grounds (`tone`), in the ESG mark's
 * rounded square (`radius-mark`, 8/40) at the mark's two sizes, so it swaps in for the ESG mark without moving the lockup.
 *
 * - In a lockup the name sits next to it, so pass `decorative`. Standalone it is `role="img"` named by `name`.
 * - At most two initials: given ones are clamped, otherwise they come from `name` like Avatar's ("Wiki Renderer" gives "WR").
 * - Tones: `indigo` (default, the TestimonialCard avatar's ground), `deep` (the NewsletterSignup strip), `glow` (the CTA
 *   card's dark ground). White initials pass 4.5:1 on all three. Never `gradient-brand`, which is the ESG mark's and the
 *   call to action's (ruled 2026-10-08).
 * - For a person, use Avatar.
 */

export const TENANT_LOGO_TONES = ["indigo", "deep", "glow"] as const
export type TenantLogoTone = (typeof TENANT_LOGO_TONES)[number]
export type TenantLogoSize = "m" | "s"

/** Whole class strings, so the Tailwind scanner finds them. */
const TONE_CLASS: Record<TenantLogoTone, string> = {
  indigo: "bg-(image:--gradient-mark-indigo)",
  deep: "bg-(image:--gradient-mark-deep)",
  glow: "bg-(image:--gradient-mark-glow)",
}

/** 42px (`logo-mark`) and 36px (`logo-mark-sm`), both with body-strong initials (the spec's size table). */
const SIZE_CLASS: Record<TenantLogoSize, string> = {
  m: "size-(--logo-mark)",
  s: "size-(--logo-mark-sm)",
}

/** The initials a TenantLogo shows: the given ones clamped to two characters, else the first letters of `name`'s first two words. */
export function tenantInitials(name: string, initials?: string): string {
  if (initials !== undefined && initials.trim() !== "") return Array.from(initials.trim()).slice(0, 2).join("").toLocaleUpperCase()
  return avatarInitials(name)
}

type TenantLogoProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** The tenant's or app's name: the accessible name, and the source of the initials. */
  name: string
  /** One or two letters; derived from `name` when omitted. */
  initials?: string
  /** The tenant's own image URL; replaces the initials and the gradient. */
  src?: string
  /** The ground behind the initials; `indigo` by default. Ignored with `src`. */
  tone?: TenantLogoTone
  size?: TenantLogoSize
  /** Hidden from assistive technology because the name is next to it (the brand lockup). */
  decorative?: boolean
}

function TenantLogo({ name, initials, src, tone = "indigo", size = "m", decorative = false, className, ...props }: TenantLogoProps) {
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": name }
  return (
    <span
      data-slot="tenant-logo"
      data-size={size}
      data-kind={src ? "image" : "initials"}
      data-tone={src ? undefined : tone}
      {...a11y}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-(--ds-radius-mark) font-sans text-body-strong leading-none font-bold uppercase select-none",
        src ? "bg-transparent" : cn("bg-surface-highlight text-ink-on-inverse", TONE_CLASS[tone]),
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- framework-agnostic registry: next/image is a Next-only API, and a mark-sized logo the tenant supplies needs no optimisation */}
      {src ? <img data-slot="tenant-logo-image" src={src} alt="" className="size-full rounded-[inherit] object-contain" /> : tenantInitials(name, initials)}
    </span>
  )
}

export { TenantLogo }
