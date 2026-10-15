export const TABLE_PRIMARY_LINK_CLASS =
  "rounded-(--ds-radius-sm) font-bold text-foreground no-underline underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-solid"

/** The secondary line under a row name (the spec's `esg-table__meta`): `caption`, `ink-secondary`, regular weight. */
export const TABLE_META_CLASS = "block text-caption font-normal text-ink-secondary"

/**
 * A cell with no value (the spec's `esg-table__blank`, ruled 2026-10-07): an em dash in `ink-secondary`, regular weight,
 * hidden from assistive technology, which reads the visually hidden label ("Not set") instead.
 */
export const TABLE_BLANK_CLASS = "font-normal text-ink-secondary"
export const TABLE_BLANK_MARK = "—"
export const TABLE_BLANK_DEFAULT_LABEL = "Not set"

/**
 * v40 (DataTable, wide tables, added 2026-10-10): the scroll cue on the table's scroll box. The box is a one-cell grid, so its
 * `::before` and `::after` are sticky layers as tall as the table, painted after it (`order-1`) at `z-sticky`, over the sticky
 * header but inside the box, which isolates its stacking. Each is a `scroll-shade` fade, `space-24` wide, shown while that edge
 * hides columns: `data-scroll-before` (scrolled away from the start) and `data-scroll-after` (not yet at the end), which
 * `useScrollEdges` keeps on the box. With the actions column pinned (`data-pin-actions`), the pinned column's own edge is the
 * right-hand cue, so `::after` stays off. Opacity fades in `duration-base`, never under reduced motion.
 *
 * Added 2026-10-12 (D4): where a hidden edge cuts the table at a column boundary (`data-scroll-before-cut` /
 * `data-scroll-after-cut`, from `scrollCuts`), the fade is `space-32` wide and the shade is laid twice, so the edge cannot pass
 * for the table's own end. Same token, no new colour. The pinned actions column keeps its own edge.
 */
export const TABLE_SCROLL_CUE_CLASS =
  "grid " +
  "before:pointer-events-none before:sticky before:left-0 before:z-(--z-sticky) before:order-1 before:[grid-area:1/1] before:w-6 before:justify-self-start " +
  "before:bg-[linear-gradient(to_right,var(--scroll-shade),transparent)] before:opacity-0 data-scroll-before:before:opacity-100 " +
  "after:pointer-events-none after:sticky after:right-0 after:z-(--z-sticky) after:order-1 after:[grid-area:1/1] after:w-6 after:justify-self-end " +
  "after:bg-[linear-gradient(to_left,var(--scroll-shade),transparent)] after:opacity-0 not-data-pin-actions:data-scroll-after:after:opacity-100 " +
  "data-scroll-before-cut:before:w-8 data-scroll-before-cut:before:bg-[linear-gradient(to_right,var(--scroll-shade),transparent),linear-gradient(to_right,var(--scroll-shade),transparent)] " +
  "not-data-pin-actions:data-scroll-after-cut:after:w-8 not-data-pin-actions:data-scroll-after-cut:after:bg-[linear-gradient(to_left,var(--scroll-shade),transparent),linear-gradient(to_left,var(--scroll-shade),transparent)] " +
  "before:transition-opacity after:transition-opacity before:duration-(--duration-base) after:duration-(--duration-base) " +
  "before:ease-(--ease-base) after:ease-(--ease-base) motion-reduce:before:transition-none motion-reduce:after:transition-none"

/**
 * v40: the left edge of a pinned actions cell, drawn by its `::before` just outside the cell: a `border` hairline against the
 * cell and a `scroll-shade` fade over the columns scrolling under it. It shows only while the scroll box carries
 * `data-scroll-after` (columns are hidden under the pinned column), never when the table fits or is scrolled to the end.
 */
const TABLE_PINNED_EDGE_CLASS =
  "before:pointer-events-none before:absolute before:top-0 before:-bottom-px before:right-full before:w-6 " +
  "before:border-r before:border-border before:bg-[linear-gradient(to_left,var(--scroll-shade),transparent)] " +
  "before:opacity-0 in-data-scroll-after:before:opacity-100 before:transition-opacity before:duration-(--duration-base) " +
  "before:ease-(--ease-base) motion-reduce:before:transition-none"

/**
 * v40: a pinned actions body or footer cell (`TableCell actions` inside `Table pinActions`): sticky at the right edge of the
 * scroll box and opaque in its row's ground, so the columns scrolling under it never show through. `surface` by default,
 * `surface-muted` in a muted row and in the footer, `surface-selected` in a selected row; on hover (on a device that can hover), or
 * while the row's menu is open, the `hover-overlay` fill is composited over that ground. As on the row, selection wins over
 * the hover fill, in a muted row too (v41, 2026-10-10: coloured text under the fill on `surface-selected` fell under 4.5:1).
 */
export const TABLE_PINNED_CELL_CLASS =
  "sticky right-0 bg-background [tfoot_&]:bg-muted " +
  "[tr[data-muted]:not([data-state=selected])>&]:bg-surface-muted " +
  "[tr[data-state=selected]>&]:bg-surface-selected " +
  "[@media(hover:hover)]:[tr:hover:not([data-state=selected])>&]:bg-(image:--hover-overlay-fill) " +
  "[tr:has([aria-expanded=true]):not([data-state=selected])>&]:bg-(image:--hover-overlay-fill) " +
  "transition-colors duration-(--duration-base) ease-(--ease-base) motion-reduce:transition-none " +
  TABLE_PINNED_EDGE_CLASS

/**
 * v40: the pinned actions header cell (`TableActionsHead` inside `Table pinActions`). It is already sticky at the top in
 * `surface-muted` at `z-sticky`; pinning adds the right edge, so it stays above both the header cells and the pinned body
 * cells that scroll under it.
 */
export const TABLE_PINNED_HEAD_CLASS = "right-0 " + TABLE_PINNED_EDGE_CLASS
