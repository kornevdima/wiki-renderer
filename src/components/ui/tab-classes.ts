import { HIT_AREA_COARSE_BEFORE_CLASS } from "@/components/ui/hit-area"

export type TabsVariant = "underline" | "pills"

export const TABS_CLASS = "grid min-w-0 gap-6 text-ink"

export const LIST_CLASS: Record<TabsVariant, string> = {
  underline: "flex gap-4 overflow-x-auto border-b border-border [scrollbar-width:thin]",
  // Pills never scroll: on a row too narrow for every label, the pills share the width and wrap their labels between words,
  // never inside one (an option keeps its min-content width) (2026-10-10;
  // a scrolled pill list hid the start of the first label in Outreach's Calculator at 390px).
  pills: "inline-flex max-w-full gap-1 justify-self-start rounded-(--ds-radius-md) border border-border bg-surface-muted p-1",
}

const TAB_BASE =
  "relative inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent text-small text-ink-secondary " +
  "focus-visible:outline-solid focus-visible:-outline-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled) " +
  "[&_svg]:size-(--icon-ui) [&_svg]:flex-none motion-reduce:transition-none"

/** The pills look without its selected state (shared by the pills tab and the segmented option). */
const PILL_BASE =
  `${TAB_BASE} ${HIT_AREA_COARSE_BEFORE_CLASS} min-h-(--control-h-m) flex-[0_1_auto] justify-center rounded-[calc(var(--ds-radius-md)-var(--space-8)/2)] px-4 py-1 text-center transition-[color,background-color] duration-(--duration-base) ease-(--ease-base) ` +
  "enabled:hover:bg-hover-overlay enabled:hover:text-ink "

export const TAB_CLASS: Record<TabsVariant, string> = {
  underline:
    `${TAB_BASE} ${HIT_AREA_COARSE_BEFORE_CLASS} h-(--control-h-s) flex-none rounded-(--ds-radius-sm) px-2 whitespace-nowrap transition-[color] duration-(--duration-base) ease-(--ease-base) ` +
    "after:absolute after:inset-x-0 after:bottom-0 after:h-(--border-divider) after:bg-transparent after:transition-[background-color] after:duration-(--duration-base) after:ease-(--ease-base) motion-reduce:after:transition-none " +
    "enabled:hover:text-ink enabled:hover:after:bg-border-strong " +
    "data-[state=active]:font-bold data-[state=active]:text-ink data-[state=active]:after:bg-primary data-[state=active]:hover:after:bg-primary",
  pills:
    PILL_BASE +
    "data-[state=active]:bg-surface-raised data-[state=active]:text-ink data-[state=active]:shadow-(--shadow-button) data-[state=active]:hover:bg-surface-raised",
}

/**
 * A segmented option: the pills tab, keyed on the toggle's `data-state="on"` instead of the tab's `active`. The state classes
 * are written out in full, never derived at runtime: Tailwind only generates classes it finds in the source text.
 */
export const SEGMENT_CLASS =
  PILL_BASE +
  "data-[state=on]:bg-surface-raised data-[state=on]:text-ink data-[state=on]:shadow-(--shadow-button) data-[state=on]:hover:bg-surface-raised"

export const COUNT_CLASS =
  "inline-flex min-w-(--avatar-xs) items-center justify-center rounded-(--ds-radius-sm) border border-border bg-surface-muted px-2 text-label font-normal text-ink-secondary tabular-nums " +
  "group-data-[state=active]/tab:border-transparent group-data-[state=active]/tab:bg-surface-selected group-data-[state=active]/tab:text-primary-text"

export const PANEL_CLASS = "min-w-0 rounded-(--ds-radius-sm) focus-visible:outline-solid focus-visible:outline-offset-2"

/**
 * A tab that is a link (TabNav): an anchor has no `:enabled`, so the hover that `TAB_CLASS` gates on `enabled:` is written here for
 * links, and the selected tab keeps its `primary` underline on hover. Add it to `TAB_CLASS.underline` on the link.
 */
export const TAB_LINK_CLASS = "no-underline hover:text-ink hover:after:bg-border-strong data-[state=active]:hover:after:bg-primary"
