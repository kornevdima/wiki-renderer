export const OVERLAY_CLASS =
  "fixed inset-0 isolate z-50 bg-scrim"
export const CONTENT_CLASS =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-3rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-(--ds-radius-lg) border bg-popover text-sm text-popover-foreground shadow-(--shadow-raised) outline-none sm:max-w-(--modal-w)"
export const CONTENT_LARGE_CLASS = "sm:max-w-(--modal-w-l)"
export const HEADER_CLASS = "flex items-start justify-between gap-4 px-6 pt-6 pb-3"
export const BODY_CLASS = "grid min-h-0 flex-1 gap-4 overflow-auto px-6 pt-1 pb-6 text-foreground"
export const FOOTER_CLASS =
  "flex flex-wrap justify-end gap-3 rounded-b-(--ds-radius-lg) border-t bg-muted px-6 py-4"
export const CLOSE_CLASS = "-mt-2 -mr-2 size-(--control-h-m) shrink-0 text-muted-foreground hover:text-foreground"
export const CONFIRM_ICON_CLASS =
  "inline-flex size-(--control-h-m) shrink-0 items-center justify-center rounded-full border border-danger-border bg-danger-surface text-danger [&_svg]:size-(--icon-control)"
