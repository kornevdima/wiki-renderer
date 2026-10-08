export const OVERLAY_CLASS =
  "fixed inset-0 isolate z-50 bg-scrim"
export const CONTENT_CLASS =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-3rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-(--ds-radius-lg) border bg-popover text-sm text-popover-foreground shadow-(--shadow-raised) outline-none sm:max-w-(--modal-w) data-discarding:[&_[data-slot=dialog-footer]]:hidden"
export const CONTENT_LARGE_CLASS = "sm:max-w-(--modal-w-l)"
export const HEADER_CLASS = "flex items-start justify-between gap-4 px-6 pt-6 pb-3"
export const BODY_CLASS = "grid min-h-0 flex-1 gap-4 overflow-auto px-6 pt-1 pb-6 text-foreground"
export const FOOTER_CLASS =
  "flex flex-wrap justify-end gap-3 rounded-b-(--ds-radius-lg) border-t bg-muted px-6 py-4"
export const CLOSE_CLASS = "-mt-2 -mr-2 size-(--control-h-m) shrink-0 text-muted-foreground hover:text-foreground"
export const CONFIRM_ICON_CLASS =
  "inline-flex size-(--control-h-m) shrink-0 items-center justify-center rounded-full border border-danger-border bg-danger-surface text-danger [&_svg]:size-(--icon-control)"

/**
 * Form sections (Modal spec, "Form sections", ruled 2026-10-07), shared with the Drawer: a section's `h3` is the plain
 * sub-heading (`body-strong`, 16/24 bold, `ink-secondary`, so it does not read as one more 14/20 bold `ink` field label) or,
 * with `accent`, the admin eyebrow (12/16 bold uppercase, `accent-text`); an optional caption is `small` `ink-secondary`.
 * Sections are separated by one hairline: a section after a section has the rule above it and `space-24` on both sides
 * (the body's 16px gap + 8px above, 24px below).
 */
export const SECTION_CLASS =
  "grid min-w-0 gap-4 [[data-slot=dialog-section]+&]:mt-2 [[data-slot=dialog-section]+&]:border-t [[data-slot=dialog-section]+&]:border-border [[data-slot=dialog-section]+&]:pt-6"
export const SECTION_HEAD_CLASS = "grid min-w-0 gap-2"
export const SECTION_TITLE_CLASS = "m-0 text-body-strong text-ink-secondary"
export const SECTION_TITLE_ACCENT_CLASS = "m-0 text-eyebrow uppercase text-accent-text"
export const SECTION_CAPTION_CLASS = "m-0 text-small text-ink-secondary"

/**
 * The discard bar (owner ruling 2026-10-08): it takes the footer's place (the footer hides while it shows) on the danger
 * Alert's ground: `danger-surface`, a `danger-border` rule on top, the icon in `danger`, the words in `ink`. The actions wrap
 * under the words on a narrow dialog.
 */
export const DISCARD_BAR_CLASS =
  "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-b-(--ds-radius-lg) border-t border-danger-border bg-danger-surface px-6 py-4"
export const DISCARD_ICON_CLASS = "size-(--icon-control) shrink-0 text-danger"
export const DISCARD_TEXT_CLASS = "grid min-w-0 flex-1 basis-40 gap-1"
export const DISCARD_ACTIONS_CLASS = "ms-auto flex flex-wrap justify-end gap-3"
