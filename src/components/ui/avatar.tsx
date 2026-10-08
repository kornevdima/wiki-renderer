import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The design system's Avatar (`project/components/Avatar`): a person in admin UI as initials on one of the four pastel
 * grounds, or a staff photo, with an optional presence dot. `AvatarGroup` stacks several with a "+N" overflow; `AvatarChip`
 * puts an avatar beside a name and a role line.
 *
 * - A standalone avatar is `role="img"` named by `label` plus the presence word ("A. K., recruiter, online"): the dot is never
 *   the only signal. Inside a chip the avatar is `aria-hidden`, because the name sits next to it.
 * - The ground comes from a stable hash of the person's ID (`toneSeed`), so a person always gets one colour. The hash and the
 *   tone order are the table person cell's (`table-person.ts`), so a person keeps the same colour in a table and here.
 * - Photos are for staff only, never candidates (the brand book's People rule): `src` renders a cover-fit round image.
 * - Never more than two initials.
 */

export const AVATAR_TONES = ["blue", "green", "pink", "coral"] as const
export type AvatarTone = (typeof AVATAR_TONES)[number]
export type AvatarSize = "m" | "s" | "xs"
export type AvatarPresence = "online" | "away" | "busy" | "offline"

/** Whole class strings, so the Tailwind scanner finds them. */
const TONE_CLASS: Record<AvatarTone, string> = {
  blue: "bg-pastel-blue",
  green: "bg-pastel-green",
  pink: "bg-pastel-pink",
  coral: "bg-pastel-coral",
}

/** 48px with body-strong initials, 32px with caption, 24px with label; all bold (the spec's size table). */
const SIZE_CLASS: Record<AvatarSize, string> = {
  m: "size-(--avatar) text-body-strong",
  s: "size-(--avatar-s) text-caption",
  xs: "size-(--avatar-xs) text-label",
}

const PRESENCE_CLASS: Record<AvatarPresence, string> = {
  online: "bg-success",
  away: "bg-warning",
  busy: "bg-danger",
  offline: "bg-ink-muted",
}

/** The presence words appended to the label; English defaults, replace them through `presenceLabel`. */
export const PRESENCE_WORDS: Record<AvatarPresence, string> = { online: "online", away: "away", busy: "busy", offline: "offline" }

/** The 2px `surface` ring that separates overlapping avatars and the dot from what is under them. */
const SURFACE_RING = "shadow-[0_0_0_var(--border-divider)_var(--surface)]"

/**
 * At most two initials from a name or an ID: the first letter or digit of each of the first two words, upper-cased.
 * Punctuation-only words are skipped ("A. K." gives "AK"; "Jean-Luc Picard" gives "JP"); a one-word name gives one letter.
 */
export function avatarInitials(name: string): string {
  const firsts: string[] = []
  for (const word of name.trim().split(/\s+/)) {
    const first = Array.from(word).find((ch) => /[\p{L}\p{N}]/u.test(ch))
    if (first) firsts.push(first)
    if (firsts.length === 2) break
  }
  return firsts.join("").toLocaleUpperCase()
}

/** The tone for a stable seed (the person's ID): the same hash as the table person cell, so colours agree across screens. */
export function avatarTone(seed: string): AvatarTone {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

/** The accessible name: the label, then the presence word when a presence is shown ("A. K., recruiter, online"). */
export function avatarLabel(label: string, presence?: AvatarPresence, presenceLabel?: string): string {
  if (!presence) return label
  return [label, presenceLabel ?? PRESENCE_WORDS[presence]].filter((part) => part.trim() !== "").join(", ")
}

/** Clamp explicit initials to the spec's two characters. */
function clampInitials(initials: string): string {
  return Array.from(initials.trim()).slice(0, 2).join("").toLocaleUpperCase()
}

type AvatarProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** The person's label and role, for the accessible name ("A. K., recruiter"). Required unless `decorative`. */
  label?: string
  /** Up to two initials. Derived from `name` when omitted. */
  initials?: string
  /** A name or ID to derive the initials from when `initials` is not given. */
  name?: string
  /** The ground; when omitted it is hashed from `toneSeed`, else blue (the spec's default). */
  tone?: AvatarTone
  /** The person's stable ID, hashed to a tone. */
  toneSeed?: string
  size?: AvatarSize
  /** A staff photo URL. Never a candidate's. */
  src?: string
  presence?: AvatarPresence
  /** The word for the presence in the accessible name; defaults to PRESENCE_WORDS. */
  presenceLabel?: string
  /** Hidden from assistive technology because a name is next to it (a chip, a table person cell). */
  decorative?: boolean
}

function Avatar({
  label,
  initials,
  name,
  tone,
  toneSeed,
  size = "m",
  src,
  presence,
  presenceLabel,
  decorative = false,
  className,
  ...props
}: AvatarProps) {
  const ground = tone ?? (toneSeed ? avatarTone(toneSeed) : "blue")
  const text = initials !== undefined ? clampInitials(initials) : avatarInitials(name ?? "")
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": avatarLabel(label ?? name ?? text, presence, presenceLabel) }
  return (
    <span
      data-slot="avatar"
      data-tone={ground}
      data-size={size}
      {...a11y}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-(--ds-radius-round) font-sans leading-none font-bold text-ink uppercase select-none",
        TONE_CLASS[ground],
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- framework-agnostic registry: next/image is a Next-only API, and an avatar-sized photo the caller supplies needs no optimisation */}
      {src ? <img data-slot="avatar-image" src={src} alt="" className="size-full rounded-[inherit] object-cover" /> : text}
      {presence ? (
        <span
          data-slot="avatar-dot"
          data-presence={presence}
          aria-hidden="true"
          className={cn("absolute right-0 bottom-0 size-[30%] min-h-2 min-w-2 rounded-(--ds-radius-round)", SURFACE_RING, PRESENCE_CLASS[presence])}
        />
      ) : null}
    </span>
  )
}

/** "+3": how many more people the group holds, on `surface-muted` with a `border-strong` outline. */
function AvatarMore({
  count,
  label,
  size = "s",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { count: number; label?: string; size?: AvatarSize }) {
  return (
    <span
      data-slot="avatar-more"
      role="img"
      aria-label={label ?? `${count} more`}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-(--ds-radius-round) border border-border-strong bg-muted font-sans leading-none font-bold text-ink tabular-nums select-none",
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      +{count}
    </span>
  )
}

/**
 * Overlapping avatars by `space-8`, each with a 2px `surface` ring, then the "+N" overflow. Children are given in reading
 * order; the spec's markup writes them reversed under `row-reverse` (so each avatar overlaps the next), and so does this.
 * The group is `role="group"` named by a count label ("Assigned: 6 people").
 */
function AvatarGroup({
  label,
  overflow = 0,
  overflowLabel,
  size = "s",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label: string; overflow?: number; overflowLabel?: string; size?: AvatarSize }) {
  const items = React.Children.toArray(children).reverse()
  return (
    <div
      data-slot="avatar-group"
      role="group"
      aria-label={label}
      className={cn("inline-flex flex-row-reverse items-center justify-end", "[&>*]:shadow-[0_0_0_var(--border-divider)_var(--surface)]", "[&>*:not(:last-child)]:-ml-2", className)}
      {...props}
    >
      {overflow > 0 ? <AvatarMore count={overflow} label={overflowLabel} size={size} /> : null}
      {items}
    </div>
  )
}

/** An avatar beside a name and a role line (`ink-secondary`), for table cells and the Topbar. The avatar is decorative here. */
function AvatarChip({
  name,
  meta,
  avatar,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  name: React.ReactNode
  meta?: React.ReactNode
  avatar: Omit<AvatarProps, "decorative" | "label">
}) {
  return (
    <span data-slot="avatar-chip" className={cn("inline-flex min-w-0 items-center gap-2 font-sans text-foreground", className)} {...props}>
      <Avatar size="s" {...avatar} decorative />
      <span className="grid min-w-0">
        <span data-slot="avatar-chip-name" className="truncate text-small">
          {name}
        </span>
        {meta != null ? (
          <span data-slot="avatar-chip-meta" className="truncate text-caption text-ink-secondary">
            {meta}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export { Avatar, AvatarChip, AvatarGroup, AvatarMore }
