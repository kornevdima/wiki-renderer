import * as React from "react"

/** The box measures `isOverflowing` reads (a DOM element has all of them). */
export interface ScrollBox {
  scrollHeight: number
  clientHeight: number
  scrollWidth: number
  clientWidth: number
}

/** True when the box's content is larger than the box on the axis, i.e. it scrolls. */
export function isOverflowing(box: ScrollBox, axis: "x" | "y"): boolean {
  return axis === "x" ? box.scrollWidth > box.clientWidth : box.scrollHeight > box.clientHeight
}

/**
 * US-175: a scroll region is a tab stop only while it actually overflows on `axis`, so a keyboard viewer can scroll it and
 * a region that fits adds no empty tab stop. Re-measured when the region is resized. It sets the DOM attribute directly,
 * so a server render (no tabindex) matches the first client render.
 */
export function useOverflowFocusable<T extends HTMLElement>(ref: React.RefObject<T | null>, axis: "x" | "y"): void {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => {
      if (isOverflowing(el, axis)) el.tabIndex = 0
      else el.removeAttribute("tabindex")
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, axis])
}

/** The measures `scrollEdges` reads (a DOM element has all of them). */
export interface ScrollEdgeBox {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}

/** Which inline edges of a scroll box hide content: `before` (scrolled away from the start), `after` (not yet at the end). */
export interface ScrollEdges {
  before: boolean
  after: boolean
}

/**
 * v40 (DataTable, wide tables, added 2026-10-10): which edges of a horizontally scrolling box have content hidden behind them.
 * A box that fits has neither. `scrollLeft` is read as a distance from the start (`Math.abs`, so a right-to-left box, whose
 * `scrollLeft` runs negative, reads the same way), and a pixel of slack absorbs fractional scroll positions at either end.
 */
export function scrollEdges(box: ScrollEdgeBox, slack = 1): ScrollEdges {
  const max = box.scrollWidth - box.clientWidth
  if (max <= slack) return { before: false, after: false }
  const offset = Math.abs(box.scrollLeft)
  return { before: offset > slack, after: offset < max - slack }
}

/**
 * R2/D4 (added 2026-10-12): does a hidden edge cut the table at a column boundary? The shade over a table that scrolls reads as
 * "more here" because it darkens text; when the cut falls in the padding between two columns, nothing is under it and the
 * edge looks like the table's own end. `bounds` are the x positions of the column starts and ends within the scrolled content
 * (px from its start); an edge is "cut" when the visible edge lies within `slack` px of one (default `space-16`, the cell
 * padding). Only for an edge that hides content. A box that does not scroll, or a right-to-left one, has no cuts.
 */
export function scrollCuts(
  bounds: readonly number[],
  box: ScrollEdgeBox,
  edges: ScrollEdges,
  slack = 16,
): ScrollEdges {
  if (!edges.before && !edges.after) return { before: false, after: false }
  const left = Math.abs(box.scrollLeft)
  const right = left + box.clientWidth
  const near = (x: number) => bounds.some((b) => Math.abs(b - x) <= slack)
  return { before: edges.before && near(left), after: edges.after && near(right) }
}

/** The sliver of the hidden column a resting scroll position keeps in view (`space-24`, 24px). */
export const PEEK_SLIVER = 24

/**
 * Never rest on a column boundary (owner, ruled 2026-10-12; spec: DataTable, "Scrolled, cut at a column boundary"). Where a
 * scroll comes to rest with a hidden edge on a column boundary (`scrollCuts`), the table looks as if it ended there, so the
 * resting position moves a little to keep a `PEEK_SLIVER` (24px) of the hidden column visible.
 *
 * The result is a position that is cut-free on BOTH edges, so it is a fixed point: calling `peekTarget` again at the returned
 * position gives null. Candidates are the left edge a sliver back before each boundary and the right edge a sliver past each
 * boundary, clamped to the scroll range (the start and the end rest there, with nothing hidden behind them); the one nearest
 * the current position that is cut-free wins. If none lies within one sliver plus the slack (40px), nothing moves and the
 * doubled fade stays. With `pinned` the right edge is not judged (the pinned column's own edge is its cue). Returns the
 * `scrollLeft` to scroll to, or null when the position is already cut-free, nothing is hidden, or no candidate is near. A box
 * with no measured columns, or a right-to-left one, has nothing to do. `slack` (16px) is smaller than the sliver.
 */
export function peekTarget(
  bounds: readonly number[],
  box: ScrollEdgeBox,
  options: { pinned?: boolean; slack?: number; sliver?: number } = {},
): number | null {
  const { pinned = false, slack = 16, sliver = PEEK_SLIVER } = options
  const max = box.scrollWidth - box.clientWidth
  const cutAt = (pos: number): boolean => {
    const at = { ...box, scrollLeft: pos }
    const cuts = scrollCuts(bounds, at, scrollEdges(at), slack)
    return cuts.before || (cuts.after && !pinned)
  }
  const left = Math.abs(box.scrollLeft)
  if (max <= 1 || bounds.length === 0 || !cutAt(left)) return null
  const reach = sliver + slack
  let best: number | null = null
  for (const b of bounds) {
    for (const raw of [b - sliver, b + sliver - box.clientWidth]) {
      const pos = Math.min(max, Math.max(0, raw))
      if (Math.abs(pos - left) < 1 || Math.abs(pos - left) > reach || cutAt(pos)) continue
      if (best === null || Math.abs(pos - left) < Math.abs(best - left)) best = pos
    }
  }
  return best
}

/** The column boundaries (starts and ends, px from the start of the content) of a table's first row, for `scrollCuts`. */
function columnBounds(box: HTMLElement): number[] {
  const row = box.querySelector("tr")
  if (!row || getComputedStyle(box).direction === "rtl") return []
  const origin = box.getBoundingClientRect().left - box.scrollLeft
  const out: number[] = []
  for (const cell of Array.from(row.children)) {
    const r = cell.getBoundingClientRect()
    out.push(r.left - origin, r.right - origin)
  }
  return out
}

/**
 * v40: keeps `data-scroll-before` and `data-scroll-after` on a horizontal scroll box in step with `scrollEdges`, on scroll and
 * whenever the box or its content (the first child, e.g. the table) is resized. Like `useOverflowFocusable` it writes the DOM
 * attributes directly, so scrolling never re-renders and a server render (no attributes) matches the first client render.
 * Added 2026-10-12: `data-scroll-before-cut` / `data-scroll-after-cut` as well, while that hidden edge falls on a column
 * boundary (`scrollCuts`), which asks for a stronger cue. The column boundaries are measured on resize, not on every scroll.
 */
export function useScrollEdges<T extends HTMLElement>(ref: React.RefObject<T | null>): void {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let bounds: number[] = []
    const sync = () => {
      const edges = scrollEdges(el)
      const cuts = scrollCuts(bounds, el, edges)
      el.toggleAttribute("data-scroll-before", edges.before)
      el.toggleAttribute("data-scroll-after", edges.after)
      el.toggleAttribute("data-scroll-before-cut", cuts.before)
      el.toggleAttribute("data-scroll-after-cut", cuts.after)
    }
    const measure = () => {
      bounds = columnBounds(el)
      sync()
    }
    measure()
    // After a user's scroll comes to rest, keep a sliver of the hidden column in view (peekTarget): `scrollend` where it exists, a
    // short quiet period elsewhere. At most one nudge per gesture: the scroll the nudge itself causes ends with its own
    // `scrollend` (or quiet period), which is ignored and clears the flag. Not on mount or resize: the page never scrolls a table
    // by itself.
    let settle: ReturnType<typeof setTimeout> | undefined
    let nudging = false
    const rest = () => {
      if (nudging) {
        nudging = false
        return
      }
      const target = peekTarget(bounds, el, { pinned: el.hasAttribute("data-pin-actions") })
      if (target === null) return
      nudging = true
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      el.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" })
    }
    const onScroll = () => {
      sync()
      if (!("onscrollend" in window)) {
        clearTimeout(settle)
        settle = setTimeout(rest, 150)
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("scrollend", rest)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      clearTimeout(settle)
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("scrollend", rest)
      observer.disconnect()
    }
  }, [ref])
}
