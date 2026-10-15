function isAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * The sum of a column's values, ignoring the rows with no value. Null when no row has a value, so the cell can show nothing
 * instead of a 0 that was never measured.
 */
export function sumValues(values: readonly (number | null | undefined)[]): number | null {
  let total = 0
  let seen = false
  for (const v of values) {
    if (!isAmount(v)) continue
    total += v
    seen = true
  }
  return seen ? total : null
}

/** One row's share of a ratio: how many (`numerator`) out of how many (`denominator`). */
export interface RatioPart {
  numerator: number | null | undefined
  denominator: number | null | undefined
}

/**
 * The pooled ratio of the rows: the sum of the numerators over the sum of the denominators, as a fraction (0.25 is 25%).
 * A row missing either part is left out of both sums, so a numerator never counts without its denominator. Null when the
 * pooled denominator is 0 or no row has both parts: there is no rate to show, so the cell shows the em dash (`TableBlank`), not 0%
 * (an empty cell means "not totalled", a different thing). Format the result at the same precision as the column's rows.
 */
export function pooledRatio(parts: readonly RatioPart[]): number | null {
  let numerator = 0
  let denominator = 0
  for (const part of parts) {
    if (!isAmount(part.numerator) || !isAmount(part.denominator)) continue
    numerator += part.numerator
    denominator += part.denominator
  }
  return denominator > 0 ? numerator / denominator : null
}
