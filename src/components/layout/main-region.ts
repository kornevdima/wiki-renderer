export const MAIN_REGION_ID = "main";

/** The skip link's own id, so the open drawer can make it inert with the rest of the page behind it. */
export const SKIP_LINK_ID = "skip-link";

/** A page's `<main>` as a one-column stack: `minmax(0, 1fr)` so a control's intrinsic width (a select) can't widen the column past the viewport. */
export const PAGE_STACK_CLASS = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6";

/** Applied to the shell's content column: a page's own `<main>` becomes a one-column `minmax(0,1fr)` stack, so no page needs its own class. */
export const SHELL_MAIN_CLASS = "[&>main]:grid [&>main]:min-w-0 [&>main]:grid-cols-[minmax(0,1fr)] [&>main]:gap-6";

export const MAIN_REGION = { id: MAIN_REGION_ID, tabIndex: -1 } as const;

/** The content column inside the shell and on the home: the page gutter (which also keeps a focus ring clear of the window edge) and the gap between blocks. */
export const PAGE_CONTENT_CLASS =
  "mx-auto grid w-full min-w-0 max-w-(--content-max) grid-cols-[minmax(0,1fr)] content-start gap-6 px-4 py-6 lg:p-8";
