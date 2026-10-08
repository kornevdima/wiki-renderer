export type OutsideInteraction = "prevent" | "allow"

export function outsideInteractionDecision(state: { dirty: boolean }): OutsideInteraction {
  return state.dirty ? "prevent" : "allow"
}

/**
 * The role props for a dialog variant. Only the confirm variant sets a role; every other variant returns no `role` key at
 * all, because `role={undefined}` spread over Radix's own `role="dialog"` would remove it.
 */
export function dialogRoleProps(variant: "default" | "confirm"): { role?: "alertdialog" } {
  return variant === "confirm" ? { role: "alertdialog" } : {}
}

/**
 * Closing a form dialog the viewer has typed in (brand book, Admin apps › Keyboard; owner ruling 2026-10-08):
 * - Esc and the corner Close (✕) ask first: an inline bar inside the dialog, "Discard changes?" with Keep editing and Discard.
 *   No second dialog is stacked on the first (the Modal's "never stack" rule stays absolute).
 * - Cancel closes at once: it is a deliberate choice.
 * - An outside click is ignored while dirty (`outsideInteractionDecision`).
 * - Esc while the bar shows means Keep editing.
 */
export type CloseSource = "escape" | "close-button" | "cancel" | "outside"
export type CloseDecision = "close" | "ask" | "keep-editing" | "ignore"

export function closeRequestDecision(state: { dirty: boolean; asking: boolean }, source: CloseSource): CloseDecision {
  if (state.asking && source === "escape") return "keep-editing"
  if (!state.dirty || source === "cancel") return "close"
  if (source === "outside") return "ignore"
  return "ask"
}

/** Esc alone: "ask" on a dirty dialog, "keep-editing" while the bar shows, else "close". */
export function escapeKeyDecision(state: { dirty: boolean; asking?: boolean }): CloseDecision {
  return closeRequestDecision({ dirty: state.dirty, asking: state.asking ?? false }, "escape")
}

/** The discard bar's words, English by default (US-224 precedent: props, no messages namespace). */
export type DiscardLabels = { question: string; description: string; keepEditing: string; discard: string }
export const DISCARD_DEFAULT_LABELS: DiscardLabels = {
  question: "Discard changes?",
  description: "What you typed will be lost.",
  keepEditing: "Keep editing",
  discard: "Discard",
}

/** The parts of a form and its controls the ⌘/Ctrl Enter rule reads; DOM elements, or plain objects in tests. */
export type SubmitterLike = { tagName?: string; type?: string; disabled?: boolean; getAttribute?: (name: string) => string | null }
export type FormLike = { elements: ArrayLike<unknown>; requestSubmit: (submitter?: never) => void }
type ClosestLike = { closest?: (selector: string) => unknown }
type QueryLike = { querySelector?: (selector: string) => unknown }

function isSubmitter(el: SubmitterLike): boolean {
  const tag = (el.tagName ?? "").toUpperCase()
  const type = (el.getAttribute?.("type") ?? el.type ?? "").toLowerCase()
  if (tag === "BUTTON") return type === "" || type === "submit"
  return tag === "INPUT" && (type === "submit" || type === "image")
}

/** The form's default button: its first submit button, including one outside it with `form="id"` (a dialog footer). */
export function findSubmitter(form: FormLike): SubmitterLike | null {
  for (const el of Array.from(form.elements) as SubmitterLike[]) if (el && isSubmitter(el)) return el
  return null
}

/**
 * ⌘/Ctrl Enter submits the dialog's form as its default button would: through `requestSubmit` (validation and the submit
 * event run, so React handlers and server actions see a normal submit). Nothing happens while that button is disabled or
 * `aria-disabled` (saving). Returns whether it submitted.
 */
export function submitFromShortcut(form: FormLike | null): boolean {
  if (!form) return false
  const submitter = findSubmitter(form)
  if (submitter && (submitter.disabled || submitter.getAttribute?.("aria-disabled") === "true")) return false
  if (submitter) form.requestSubmit(submitter as never)
  else form.requestSubmit()
  return true
}

/** The form a shortcut in a dialog submits: the one holding the focused control, else the dialog's first form. */
export function formForShortcut(target: unknown, content: unknown): FormLike | null {
  const fromTarget = (target as ClosestLike | null)?.closest?.("form") as FormLike | null | undefined
  if (fromTarget) return fromTarget
  return ((content as QueryLike | null)?.querySelector?.("form") as FormLike | null | undefined) ?? null
}
