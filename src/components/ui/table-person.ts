export const AVATAR_TONES = ["blue", "green", "pink", "coral"] as const
export type AvatarTone = (typeof AVATAR_TONES)[number]

export function personInitials(name: string, email?: string): string {
  const fromName = name.trim().split(/\s+/).filter(Boolean)
  if (fromName.length > 0) {
    return Array.from(fromName.map((word) => Array.from(word)[0]).join("")).slice(0, 2).join("").toUpperCase()
  }
  const first = Array.from((email ?? "").trim())[0]
  return first ? first.toUpperCase() : ""
}

/** The label shown beside the avatar: the name, or the email when the name is blank. */
export function personLabel(name: string, email?: string): string {
  return name.trim() !== "" ? name : (email ?? "")
}

export function avatarTone(seed: string): AvatarTone {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

/** Tailwind class strings, whole, so the scanner finds them (a built-up `bg-pastel-${tone}` would never be generated). */
export const AVATAR_TONE_CLASS: Record<AvatarTone, string> = {
  blue: "bg-pastel-blue",
  green: "bg-pastel-green",
  pink: "bg-pastel-pink",
  coral: "bg-pastel-coral",
}
