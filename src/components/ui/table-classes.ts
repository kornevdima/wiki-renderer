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
