"use client"

import * as React from "react"
import { useOverflowFocusable, useScrollEdges } from "@/components/ui/overflow-focusable"
import { SkeletonBar } from "@/components/ui/skeleton"
import { AVATAR_TONE_CLASS, avatarTone, personInitials, personLabel } from "@/components/ui/table-person"
import {
  TABLE_BLANK_CLASS,
  TABLE_BLANK_DEFAULT_LABEL,
  TABLE_BLANK_MARK,
  TABLE_PINNED_CELL_CLASS,
  TABLE_PINNED_HEAD_CLASS,
  TABLE_SCROLL_CUE_CLASS,
} from "@/components/ui/table-classes"
import { cn } from "@/lib/utils"

/**
 * US-175 (NFR-013; ADR-014, ADR-019): the design system's DataTable on the vendored table. The table sits in a scroll
 * region that becomes focusable (`tabIndex=0`) only while it overflows horizontally, so a keyboard viewer can scroll it and it takes the global focus outline and, when
 * the caller names it, a `region` landmark: pass `regionLabelledBy` (the id of the heading above the table) or
 * `regionLabel`. Headers are `scope="col"`, the first cell of a row is a row header (`TableRowHead`, `scope="row"`), number
 * columns are right-aligned with tabular numerals (`numeric`), and an actions column has a screen-reader-only header
 * (`TableActionsHead`). Colours and sizes come from the tokens in globals.css.
 *
 * v40 (DataTable, wide tables, added 2026-10-10): while the table overflows, a `scroll-shade` fade marks each edge that hides
 * columns (`useScrollEdges` sets `data-scroll-before` / `data-scroll-after` on the scroll box; `TABLE_SCROLL_CUE_CLASS`).
 * `pinActions` keeps the actions column (`TableActionsHead` and every `TableCell actions`) at the right edge of the box, with
 * a hairline and the fade on its left while columns scroll under it. Pin only the actions column, and only on a table that
 * can be wider than its box. Row menus portal to the page body, so a pinned cell never clips them.
 */
const TablePinContext = React.createContext(false)

function Table({
  className,
  regionLabelledBy,
  regionLabel,
  pinActions = false,
  ...props
}: React.ComponentProps<"table"> & { regionLabelledBy?: string; regionLabel?: string; pinActions?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useOverflowFocusable(ref, "x")
  useScrollEdges(ref)
  const named = regionLabelledBy !== undefined || regionLabel !== undefined
  return (
    <div
      ref={ref}
      data-slot="table-container"
      data-pin-actions={pinActions || undefined}
      role={named ? "region" : undefined}
      aria-labelledby={regionLabelledBy}
      aria-label={regionLabel}
      className={cn("relative isolate max-w-full overflow-auto rounded-(--ds-radius-lg) border bg-background", TABLE_SCROLL_CUE_CLASS)}
    >
      <TablePinContext.Provider value={pinActions}>
        <table
          data-slot="table"
          className={cn("w-full border-separate border-spacing-0 caption-bottom text-sm text-foreground [grid-area:1/1]", className)}
          {...props}
        />
      </TablePinContext.Provider>
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={className}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child>*]:border-b-0", className)}
      {...props}
    />
  )
}

/**
 * The Total row (D4, added 2026-10-12; spec: DataTable, "Total row"): `tfoot` is `surface-muted` with bold `ink` text, rows
 * `row-h-compact` high and a `border-strong` rule above, the strongest line in the table (owner, ruled 2026-10-12: it was a plain `border`
 * hairline and the row barely differed from a data row). Its last row has no bottom border, so the box's
 * own edge is the only rule. The label is a `TableRowHead` ("Total"), a column that cannot be totalled (a name, a status, a
 * date) is an empty `TableCell`, and a count is a `numeric` `TableCell`. The row totals the rows of the current result: sums for
 * counts and amounts, and for a ratio the pooled value, the sum of the numerators over the sum of the denominators, never the
 * average of the rows' percentages (`sumValues`, `pooledRatio` in `table-totals.ts`). Its label says what it totals ("Team total",
 * "Total (3 of 12)"), a ratio shows at the column's precision, a pooled 0 of 0 is the em dash (`TableBlank`) and a column that is not
 * totalled is an empty cell.
 */
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted font-bold text-foreground [&>tr:last-child>*]:border-b-0 [&>tr>*]:h-(--row-h-compact) [&>tr>*]:border-t [&>tr>*]:border-t-border-strong", className)}
      {...props}
    />
  )
}

/**
 * US-226 (spec: DataTable, "De-emphasised (muted)"): an archived or inactive row. A change of ground and text colour, never
 * opacity: `ink-secondary` on `surface-muted` (6.01:1 light / 9.86:1 dark; 5.55 / 8.34 under the hover fill). The row name
 * (`th`) and links turn `ink-secondary` too; buttons (Restore) and StatusBadges keep their colours. Selection still wins, and
 * a selected muted row takes no hover fill (v41, 2026-10-10), as an ordinary selected row.
 * The row must also carry a word, the Archived Tag, so the state is never colour alone.
 */
export {
  TABLE_BLANK_CLASS,
  TABLE_META_CLASS,
  TABLE_PINNED_CELL_CLASS,
  TABLE_PINNED_HEAD_CLASS,
  TABLE_PRIMARY_LINK_CLASS,
  TABLE_SCROLL_CUE_CLASS,
} from "@/components/ui/table-classes"

export const TABLE_ROW_MUTED_CLASS =
  "data-muted:not-data-[state=selected]:bg-surface-muted data-muted:text-ink-secondary " +
  "data-muted:not-data-[state=selected]:hover:bg-(image:--hover-overlay-fill) data-muted:not-data-[state=selected]:has-aria-expanded:bg-(image:--hover-overlay-fill) " +
  "[&[data-muted]_th]:text-ink-secondary [&[data-muted]_a]:text-ink-secondary"

function TableRow({ className, muted = false, ...props }: React.ComponentProps<"tr"> & { muted?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-muted={muted || undefined}
      className={cn(
        "transition-colors duration-(--duration-base) ease-(--ease-base) motion-reduce:transition-none not-data-muted:hover:bg-hover-overlay not-data-muted:has-aria-expanded:bg-hover-overlay data-[state=selected]:bg-surface-selected",
        TABLE_ROW_MUTED_CLASS,
        className
      )}
      {...props}
    />
  )
}

const NUMERIC = "text-right tabular-nums"

/** A column header. `scope="col"` by default; `numeric` right-aligns it over a number column. */
function TableHead({
  className,
  numeric = false,
  scope = "col",
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn(
        "sticky top-0 z-(--z-sticky) h-(--row-h-compact) border-b bg-muted px-4 text-left align-middle font-bold whitespace-nowrap text-muted-foreground",
        numeric && NUMERIC,
        className
      )}
      {...props}
    />
  )
}

type TableSortDirection = "ascending" | "descending"

/**
 * v34 (spec: DataTable, "Sort button" and "Sorted"): a sortable column header. The `th` carries `aria-sort` only while the
 * column is sorted (one column at a time; your sort state decides which); it holds a `<button type="button">` with the
 * label and the sort icon, an up and a down arrow. Idle, the label is the header's `ink-secondary` (`ink` on hover) and both
 * arrows are `ink-muted`; sorted, the label is `ink` and a single arrow (up ascending, down descending) is `primary-text`.
 * `numeric` right-aligns it over a number column and puts the icon before the label, so the label lines up with the numbers.
 * Focus is the global outline with `radius-sm` corners. Sorting itself is your code: `onSort` is the button's click.
 */
function TableSortHead({
  direction,
  onSort,
  numeric = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"th">, "aria-sort" | "onClick"> & {
  /** The column's sort, or `false` when it is not the sorted column. */
  direction: TableSortDirection | false
  onSort: () => void
  numeric?: boolean
}) {
  const sorted = direction !== false
  return (
    <TableHead
      data-slot="table-sort-head"
      aria-sort={sorted ? direction : undefined}
      numeric={numeric}
      className={className}
      {...props}
    >
      <button
        type="button"
        data-slot="table-sort"
        onClick={onSort}
        className={cn(
          "m-0 inline-flex cursor-pointer items-center gap-2 rounded-(--ds-radius-sm) border-0 bg-transparent p-0 font-[inherit] whitespace-nowrap focus-visible:outline-solid",
          sorted ? "text-foreground" : "hover:text-foreground",
          numeric && "flex-row-reverse"
        )}
      >
        {children}
        <svg
          data-slot="table-sort-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn("size-(--icon-ui) flex-none", sorted ? "text-primary-text" : "text-ink-muted")}
        >
          <path data-slot="table-sort-up" d="m8 9 4-4 4 4" className={direction === "descending" ? "opacity-0" : undefined} />
          <path data-slot="table-sort-down" d="m8 15 4 4 4-4" className={direction === "ascending" ? "opacity-0" : undefined} />
        </svg>
      </button>
    </TableHead>
  )
}

/**
 * The actions column's header: no visible text, but a name for assistive technology. Inside `Table pinActions` it is pinned
 * to the right edge (`data-pinned`).
 */
function TableActionsHead({
  className,
  children,
  ...props
}: React.ComponentProps<"th">) {
  const pinned = React.useContext(TablePinContext)
  return (
    <TableHead
      data-pinned={pinned || undefined}
      className={cn("w-px text-right", pinned && TABLE_PINNED_HEAD_CLASS, className)}
      {...props}
    >
      <span className="sr-only">{children}</span>
    </TableHead>
  )
}

/** The first cell of a row: a row header (`scope="row"`), set as the row's primary text. */
function TableRowHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-row-head"
      scope="row"
      className={cn("h-(--row-h) border-b px-4 text-left align-middle font-bold whitespace-nowrap text-foreground", className)}
      {...props}
    />
  )
}

/** A body or footer cell. `numeric` right-aligns a number; `actions` is the row's actions cell, pinned inside `Table pinActions`. */
function TableCell({
  className,
  numeric = false,
  actions = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean; actions?: boolean }) {
  const pinned = React.useContext(TablePinContext) && actions
  return (
    <td
      data-slot="table-cell"
      data-pinned={pinned || undefined}
      className={cn(
        "h-(--row-h) border-b px-4 align-middle whitespace-nowrap",
        numeric && NUMERIC,
        actions && "text-right",
        pinned && TABLE_PINNED_CELL_CLASS,
        className
      )}
      {...props}
    />
  )
}

/**
 * "No value" (DataTable spec, ruled 2026-10-07): the em dash in `ink-secondary`, `aria-hidden`, with a visually hidden label
 * for screen readers. `label` is the app's translation, English "Not set" by default (US-224 precedent: a prop, no messages
 * namespace). Use it inside any cell; `TableBlankCell` is the whole cell.
 */
function TableBlank({ label = TABLE_BLANK_DEFAULT_LABEL }: { label?: string }) {
  return (
    <>
      <span data-slot="table-blank" aria-hidden="true" className={TABLE_BLANK_CLASS}>
        {TABLE_BLANK_MARK}
      </span>
      <span className="sr-only">{label}</span>
    </>
  )
}

/** A body cell with no value: `TableCell` holding `TableBlank`. Takes TableCell's props (`numeric` keeps the dash right-aligned). */
function TableBlankCell({
  label,
  ...props
}: Omit<React.ComponentProps<typeof TableCell>, "children"> & { label?: string }) {
  return (
    <TableCell data-blank="true" {...props}>
      <TableBlank label={label} />
    </TableCell>
  )
}

/** The one cell of an empty table's body row: it spans every column and holds the compact EmptyState. */
function TableEmptyCell({
  className,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-empty-cell"
      className={cn("h-auto p-0 text-center whitespace-normal", className)}
      {...props}
    />
  )
}

/**
 * US-181: the person cell, an avatar with the person's initials beside the name (the design system's `.esg-table__person`).
 * Put it inside `TableRowHead`. The avatar is decorative (`aria-hidden`), so the name is what a screen reader reads; a blank
 * name falls back to the email, for both the initials and the label. US-184 adds the optional `caption` under the name (the
 * design system's `.esg-table__meta`; the project member's tenant), shown only when given.
 */
function TablePersonCell({
  name,
  email,
  caption,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { name: string; email?: string; caption?: string }) {
  const label = personLabel(name, email)
  const nameText = (
    <span data-slot="table-person-name" className="min-w-0 text-foreground">
      {label}
    </span>
  )
  return (
    <span data-slot="table-person" className={cn("inline-flex min-w-0 items-center gap-3 align-middle", className)} {...props}>
      <span
        data-slot="table-person-avatar"
        aria-hidden="true"
        className={cn(
          "inline-flex size-(--avatar-s) flex-none items-center justify-center rounded-full text-xs leading-none font-bold text-foreground uppercase select-none",
          AVATAR_TONE_CLASS[avatarTone(label)]
        )}
      >
        {personInitials(name, email)}
      </span>
      {caption ? (
        <span data-slot="table-person-text" className="grid min-w-0">
          {nameText}
          <span data-slot="table-person-caption" className="text-xs font-normal text-muted-foreground">
            {caption}
          </span>
        </span>
      ) : (
        nameText
      )}
    </span>
  )
}

/**
 * US-181: a body row shown while the table's data loads, `columns` cells each holding a skeleton bar (`numericColumns` are the
 * 0-based indexes of a right-aligned number column, whose bar sits at the right edge and is shorter). Its pulse is under
 * `motion-safe:` (`ui/skeleton.tsx`). The row is decorative; the caller marks the table `aria-busy` and announces the loading.
 * v40: `actions` makes the last of the `columns` an empty actions cell, so it stays pinned with the header in `Table pinActions`.
 */
function TableSkeletonRow({
  columns,
  numericColumns = [],
  actions = false,
  className,
  ...props
}: Omit<React.ComponentProps<"tr">, "children"> & { columns: number; numericColumns?: readonly number[]; actions?: boolean }) {
  return (
    <tr data-slot="table-skeleton-row" aria-hidden="true" className={className} {...props}>
      {Array.from({ length: columns }, (_, index) => {
        const numeric = numericColumns.includes(index)
        if (actions && index === columns - 1) return <TableCell key={index} actions />
        return (
          <TableCell key={index} numeric={numeric}>
            <SkeletonBar className={numeric ? "ml-auto w-[40%]" : undefined} />
          </TableCell>
        )
      })}
    </tr>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("p-4 text-left text-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableActionsHead,
  TableBlank,
  TableBlankCell,
  TableBody,
  TableCaption,
  TableCell,
  TableEmptyCell,
  TableFooter,
  TableHead,
  TableHeader,
  TablePersonCell,
  TableRow,
  TableRowHead,
  TableSkeletonRow,
  TableSortHead,
}
export type { TableSortDirection }
