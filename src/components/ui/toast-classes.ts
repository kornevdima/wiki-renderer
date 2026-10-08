export const VIEWPORT_CLASS =
  "fixed right-6 bottom-6 z-(--z-toast) m-0 flex w-[min(400px,calc(100vw-2rem))] list-none flex-col gap-3 p-0 outline-none pointer-events-none"
export const TOAST_CLASS =
  "pointer-events-auto list-none rounded-(--ds-radius-md) border border-border bg-surface-raised p-4 text-foreground shadow-(--shadow-raised) motion-safe:animate-[esg-toast-in_var(--duration-base)_var(--ease-standard)]"
/** The element inside the list item that carries the status or alert role: the three-column layout of icon, text and Dismiss. */
export const CONTENT_CLASS = "grid grid-cols-[auto_1fr_auto] items-start gap-3"
export const ICON_CLASS = "mt-0.5 size-(--icon-control) shrink-0"
export const BODY_CLASS = "grid min-w-0 gap-1"
export const TITLE_CLASS = "m-0 text-base leading-6 font-bold text-foreground"
export const TEXT_CLASS = "m-0 text-sm leading-5 font-normal text-muted-foreground"
export const CLOSE_CLASS =
  "-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-(--ds-radius-md) border-0 bg-transparent p-0 text-muted-foreground hover:bg-hover-overlay hover:text-foreground motion-safe:transition-colors motion-safe:duration-(--duration-fast)"
export const VARIANT_ICON_CLASS = {
  neutral: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const
