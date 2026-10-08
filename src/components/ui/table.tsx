"use client"

import * as React from "react"
import { useOverflowFocusable } from "@/components/ui/overflow-focusable"
import { SkeletonBar } from "@/components/ui/skeleton"
import { AVATAR_TONE_CLASS, avatarTone, personInitials, personLabel } from "@/components/ui/table-person"
import { TABLE_BLANK_CLASS, TABLE_BLANK_DEFAULT_LABEL, TABLE_BLANK_MARK } from "@/components/ui/table-classes"
import { cn } from "@/lib/utils"

/**
 * US-175 (NFR-013; ADR-014, ADR-019): the design system's DataTable on the vendored table. The table sits in a scroll
 * region that becomes focusable (`tabIndex=0`) only while it overflows horizontally, so a keyboard viewer can scroll it and it takes the global focus outline and, when
 * the caller names it, a `region` landmark: pass `regionLabelledBy` (the id of the heading above the table) or
 * `regionLabel`. Headers are `scope="col"`, the first cell of a row is a row header (`TableRowHead`, `scope="row"`), number
 * columns are right-aligned with tabular numerals (`numeric`), and an actions column has a screen-reader-only header
 * (`TableActionsHead`). Colours and sizes come from the tokens in globals.css.
 */
function Table({
  className,
  regionLabelledBy,
  regionLabel,
  ...props
}: React.ComponentProps<"table"> & { regionLabelledBy?: string; regionLabel?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useOverflowFocusable(ref, "x")
  const named = regionLabelledBy !== undefined || regionLabel !== undefined
  return (
    <div
      ref={ref}
      data-slot="table-container"
      role={named ? "region" : undefined}
      aria-labelledby={regionLabelledBy}
      aria-label={regionLabel}
      className="relative max-w-full overflow-auto rounded-(--ds-radius-lg) border bg-background"
    >
      <table
        data-slot="table"
        className={cn("w-full border-separate border-spacing-0 caption-bottom text-sm text-foreground", className)}
        {...props}
      />
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

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted font-bold [&>tr>*]:border-t", className)}
      {...props}
    />
  )
}

/**
 * US-226 (spec: DataTable, "De-emphasised (muted)"): an archived or inactive row. A change of ground and text colour, never
 * opacity: `ink-secondary` on `surface-muted` (6.01:1 light / 9.86:1 dark; 5.55 / 8.34 under the hover fill). The row name
 * (`th`) and links turn `ink-secondary` too; buttons (Restore) and StatusBadges keep their colours. Selection still wins.
 * The row must also carry a word, the Archived Tag, so the state is never colour alone.
 */
export { TABLE_BLANK_CLASS, TABLE_META_CLASS, TABLE_PRIMARY_LINK_CLASS } from "@/components/ui/table-classes"

export const TABLE_ROW_MUTED_CLASS =
  "data-muted:not-data-[state=selected]:bg-surface-muted data-muted:text-ink-secondary " +
  "data-muted:hover:bg-(image:--hover-overlay-fill) data-muted:has-aria-expanded:bg-(image:--hover-overlay-fill) " +
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
        "sticky top-0 z-10 h-(--row-h-compact) border-b bg-muted px-4 text-left align-middle font-bold whitespace-nowrap text-muted-foreground",
        numeric && NUMERIC,
        className
      )}
      {...props}
    />
  )
}

/** The actions column's header: no visible text, but a name for assistive technology. */
function TableActionsHead({
  className,
  children,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <TableHead className={cn("w-px text-right", className)} {...props}>
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

function TableCell({
  className,
  numeric = false,
  actions = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean; actions?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-(--row-h) border-b px-4 align-middle whitespace-nowrap",
        numeric && NUMERIC,
        actions && "text-right",
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
 */
function TableSkeletonRow({
  columns,
  numericColumns = [],
  className,
  ...props
}: Omit<React.ComponentProps<"tr">, "children"> & { columns: number; numericColumns?: readonly number[] }) {
  return (
    <tr data-slot="table-skeleton-row" aria-hidden="true" className={className} {...props}>
      {Array.from({ length: columns }, (_, index) => {
        const numeric = numericColumns.includes(index)
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
}
