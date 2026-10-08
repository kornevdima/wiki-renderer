/**
 * The tag chip's classes, shared so the page meta line (US-220) and the All properties `tags` row draw identical tags
 * (SA-MOD Reader UI and print E3-5). `min-w-0` with `overflow-wrap: anywhere` lets a long unbroken tag wrap inside its chip.
 */
export const CHIPS = "m-0 flex min-w-0 list-none flex-wrap gap-(--gap-tags) p-0";
export const CHIP =
  "inline-flex min-w-0 max-w-full items-center rounded-(--ds-radius-sm) border border-border bg-background px-(--pad-tag-x) py-(--pad-tag-y) text-xs leading-4 text-foreground [overflow-wrap:anywhere]";
