export type WidthGuide = { id: string; label: string; px: number }

/** The default snap distance, in px of width. */
export const DEFAULT_SNAP_PX = 8
/** Arrow key step, and its Shift step, in px of width. */
export const KEY_STEP_PX = 16
export const KEY_STEP_LARGE_PX = 64

/** Keep `value` inside [min, max]. If the window is too small (max < min) the minimum wins. */
export function clampWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max < min ? min : max, value))
}

/** The guides that fall inside [min, max], ascending by px; duplicates of a px keep the first one given. */
export function visibleGuides(guides: readonly WidthGuide[], min: number, max: number): WidthGuide[] {
  const seen = new Set<number>()
  return guides
    .filter((g) => Number.isFinite(g.px) && g.px >= min && g.px <= max)
    .toSorted((a, b) => a.px - b.px)
    .filter((g) => (seen.has(g.px) ? false : (seen.add(g.px), true)))
}

/** The nearest visible guide within `snapPx` of `value` (the lower one on a tie), or null. */
export function nearestGuide(value: number, guides: readonly WidthGuide[], snapPx: number): WidthGuide | null {
  let best: WidthGuide | null = null
  let bestDistance = Infinity
  for (const g of guides) {
    const d = Math.abs(g.px - value)
    if (d <= snapPx && d < bestDistance) {
      best = g
      bestDistance = d
    }
  }
  return best
}

/** Clamp, then snap to a guide within `snapPx`. `guides` are the visible ones. Returns the width and the guide snapped to. */
export function snapWidth(value: number, min: number, max: number, guides: readonly WidthGuide[], snapPx: number): { px: number; guideId: string | null } {
  const px = clampWidth(value, min, max)
  const guide = nearestGuide(px, guides, snapPx)
  return guide ? { px: guide.px, guideId: guide.id } : { px, guideId: null }
}

/** The guide `value` is on (within half a px, so a fractional guide such as 680.315 matches the width a snap set), or null. */
export function guideAt(value: number, guides: readonly WidthGuide[]): WidthGuide | null {
  return guides.find((g) => Math.abs(g.px - value) < 0.5) ?? null
}

/** The next guide wider than `value`, or null. `guides` must be ascending (see visibleGuides). */
export function nextGuide(value: number, guides: readonly WidthGuide[]): WidthGuide | null {
  return guides.find((g) => g.px > value) ?? null
}

/** The previous guide narrower than `value`, or null. `guides` must be ascending. */
export function prevGuide(value: number, guides: readonly WidthGuide[]): WidthGuide | null {
  for (let i = guides.length - 1; i >= 0; i--) if (guides[i].px < value) return guides[i]
  return null
}

/**
 * One keyboard step of `delta` px (±16, Shift ±64). The step never skips a guide: when it would cross the next guide in its
 * direction, or land within `snapPx` of it, it stops exactly on that guide (so a drag and the keys snap alike). A guide the width
 * is already on (within half a px) is not "ahead", so the next step moves off it normally. `guides` must be ascending and visible
 * (see visibleGuides). The result is clamped to [min, max] and names the guide it is on.
 */
export function stepWidth(value: number, delta: number, guides: readonly WidthGuide[], snapPx: number, min: number, max: number): { px: number; guideId: string | null } {
  const target = value + delta
  let hit: WidthGuide | null = null
  if (delta > 0) {
    const ahead = guides.find((g) => g.px > value + 0.5)
    if (ahead && target >= ahead.px - snapPx) hit = ahead
  } else if (delta < 0) {
    const behind = guides.toReversed().find((g) => g.px < value - 0.5)
    if (behind && target <= behind.px + snapPx) hit = behind
  }
  const px = clampWidth(hit ? hit.px : target, min, max)
  return { px, guideId: guideAt(px, guides)?.id ?? null }
}

/** The width after a pointer moved `dx` px: a centred column grows by 2·dx when `symmetric`. */
export function widthFromDrag(startWidth: number, dx: number, symmetric: boolean): number {
  return startWidth + (symmetric ? 2 : 1) * dx
}

/** Where a guide's marker sits, in px from the column's left edge, for a column `width` wide. Symmetric: either side of the centre. */
export function markerOffsets(guidePx: number, width: number, symmetric: boolean): { start: number; end: number } {
  return symmetric ? { start: (width - guidePx) / 2, end: (width + guidePx) / 2 } : { start: 0, end: guidePx }
}

/** The default announcement: the guide's label with the width, or the width alone. */
export function defaultValueText(px: number, guide: WidthGuide | null): string {
  return guide ? `${guide.label}, ${Math.round(px)} px` : `${Math.round(px)} px`
}

/** A guide label chip's span along the ruler: where it starts (px from the column's left edge) and how wide it is. */
export type LabelSpan = { id: string; start: number; width: number }

/** Chip padding and border (px) added to the text estimate, and the text's px per character. */
const CHIP_PAD_PX = 18
const CHIP_CHAR_PX = 7

/** A chip's width without measuring it: deterministic, a little generous so staggered chips never touch. */
export function estimateChipWidth(label: string): number {
  return Math.ceil(label.length * CHIP_CHAR_PX) + CHIP_PAD_PX
}

/**
 * Which ruler row each label goes on so that no two chips overlap: the chips, left to right, each take the first row whose last
 * chip ends at least `gap` px before it starts (row 0 is the nearest the column, later rows stack away from it).
 */
export function assignLabelRows(spans: readonly LabelSpan[], gap = 8): Record<string, number> {
  const ends: number[] = []
  const rows: Record<string, number> = {}
  for (const s of spans.toSorted((a, b) => a.start - b.start)) {
    let row = ends.findIndex((end) => s.start >= end + gap)
    if (row === -1) row = ends.length
    ends[row] = s.start + s.width
    rows[s.id] = row
  }
  return rows
}

/** Half the focus ring box's width (px) around the grip's centre: half the 24px hit area, the ring offset (2) and the ring (2). */
export const GRIP_RING_HALF_PX = 16

/** The room a chip may use, in px from the column's left edge: the viewport and any scroll container, intersected. */
export type Available = { left: number; right: number }

export type GripLabelPlacement = { id: string; left: number; row: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Where the guide labels go in "grip" placement (left edges, px from the column's left edge, and rows). A guide line left of the
 * grip puts its chip on the line's left (the chip's right edge `gap` before the line), a line right of the grip on its right, and a
 * chip never enters the ring box [gripX − GRIP_RING_HALF_PX, gripX + GRIP_RING_HALF_PX] (a line inside it is pushed out to the side
 * it is on). With `available`, a chip that would leave it on its preferred side flips to the other side of its line; as a last
 * resort it is clamped inside and moved clear of the ring. Chips that would then touch take the next row (assignLabelRows).
 */
export function placeGripLabels(
  items: readonly { id: string; x: number; width: number }[],
  gripX: number,
  gap = 8,
  available?: Available,
): GripLabelPlacement[] {
  const ringLeft = gripX - GRIP_RING_HALF_PX
  const ringRight = gripX + GRIP_RING_HALF_PX
  const spans = items.map((i) => {
    const w = i.width
    // The chip left of its line: beside the line if that is clear of the ring, else on the ring's left.
    const leftOfLine = i.x >= gripX ? (i.x - gap - w >= ringRight + gap ? i.x - gap - w : ringLeft - gap - w) : Math.min(i.x, ringLeft) - gap - w
    // The chip right of its line: beside the line if that is clear of the ring, else on the ring's right.
    const rightOfLine = i.x < gripX ? (i.x + gap + w <= ringLeft - gap ? i.x + gap : ringRight + gap) : Math.max(i.x, ringRight) + gap
    const prefersLeft = i.x < gripX
    const inside = (l: number) => !available || (l >= available.left && l + w <= available.right)
    const clear = (l: number) => l + w <= ringLeft - gap || l >= ringRight + gap
    const [first, second] = prefersLeft ? [leftOfLine, rightOfLine] : [rightOfLine, leftOfLine]
    let left = first
    if (!inside(first)) {
      if (inside(second) && clear(second)) left = second
      else if (available) {
        left = clamp(first, available.left, Math.max(available.left, available.right - w))
        if (!clear(left)) {
          const roomLeft = ringLeft - gap - available.left
          const roomRight = available.right - (ringRight + gap)
          left = clamp(roomLeft >= roomRight ? ringLeft - gap - w : ringRight + gap, available.left, Math.max(available.left, available.right - w))
        }
      }
    }
    return { id: i.id, start: left, width: w }
  })
  const rows = assignLabelRows(spans, gap)
  return spans.map((sp) => ({ id: sp.id, left: sp.start, row: rows[sp.id] }))
}

/** "Top" placement: chips centred on their line, shifted to stay inside `available` (a chip wider than it starts at its left). */
export function placeTopLabels(items: readonly { id: string; x: number; width: number }[], gap = 8, available?: Available): GripLabelPlacement[] {
  const spans = items.map((i) => {
    const centred = i.x - i.width / 2
    const left = available ? clamp(centred, available.left, Math.max(available.left, available.right - i.width)) : centred
    return { id: i.id, start: left, width: i.width }
  })
  const rows = assignLabelRows(spans, gap)
  return spans.map((sp) => ({ id: sp.id, left: sp.start, row: rows[sp.id] }))
}

/** A chip centred on `x`, kept inside `available`: its left edge. */
export function centredChipLeft(x: number, width: number, available?: Available): number {
  const left = x - width / 2
  return available ? clamp(left, available.left, Math.max(available.left, available.right - width)) : left
}

/** Half the height (px) of a guide segment in "grip" placement: the `space-80` token, so a segment is 160px tall. */
export const GRIP_SEGMENT_HALF_PX = 80
/** Half the height (px) of the grip's bar (h-10) and the gap under the grip's ring box where the readout starts. */
export const GRIP_BAR_HALF_PX = 20
const READOUT_GAP_PX = 12
/** The grip's own box is 176px tall (segment plus a margin); a host that stretches it past this is treated as column-tall. */
export const GRIP_BOX_MAX_PX = 240

/** Where the grip's bar sits and how tall the column is, in px from the column's top edge (measured; the host may make the grip sticky). */
export type GripGeometry = { barY: number; gripTop: number; gripBottom: number; columnHeight: number }

/** A guide segment in "grip" placement: grip.y ± GRIP_SEGMENT_HALF_PX, kept inside the column. */
export function gripSegment(barY: number, columnHeight: number, half = GRIP_SEGMENT_HALF_PX): { top: number; height: number } {
  const top = Math.max(0, barY - half)
  const bottom = Math.max(top, Math.min(columnHeight, barY + half))
  return { top, height: bottom - top }
}

/**
 * The readout in "grip" placement (left edge and top, px from the column's left and top edges). Just below the grip's ring box,
 * centred on the grip, when that box is short (the grip is 176px tall, centred on the bar); when a host makes it as tall as a tall column
 * it goes beside the ring, under the bar's middle, on the side with room. Never at the column's bottom.
 */
export function placeGripReadout(geometry: GripGeometry, gripX: number, width: number, available?: Available): { left: number; top: number } {
  const barBottom = geometry.barY + GRIP_BAR_HALF_PX
  if (geometry.gripBottom - geometry.gripTop <= GRIP_BOX_MAX_PX) {
    return { left: centredChipLeft(gripX, width, available), top: Math.max(geometry.gripBottom, barBottom) + READOUT_GAP_PX }
  }
  const right = gripX + GRIP_RING_HALF_PX + 8
  const left = gripX - GRIP_RING_HALF_PX - 8 - width
  const fitsRight = !available || right + width <= available.right
  return { left: fitsRight ? right : left, top: geometry.barY + 8 }
}

/**
 * Narrow `measured` (the viewport and clipping ancestors) to `room` (the app's explicit bounds), both in the same coordinates.
 * Where nothing was measured, or the two do not overlap, the app's room wins; with no room, `measured` is unchanged.
 */
export function intersectRoom(measured: Available | undefined, room: Available | undefined): Available | undefined {
  if (!room || !(room.right > room.left)) return measured
  if (!measured) return room
  const left = Math.max(measured.left, room.left)
  const right = Math.min(measured.right, room.right)
  return right > left ? { left, right } : room
}

/** Where the grip was and how wide the column was at one measurement (the grip sits on the column's right edge), px. */
export type DragSample = { gripX: number; width: number }

/**
 * A pointer drag's anchor. A drag maps the pointer to a width as `startWidth + k·(pointerX − startX)`, k = 2 (symmetric) or 1.
 * `offset` is the pointer's distance from the grip at the press (kept for the whole drag). `last` is the previous measurement and
 * `armed` is the loop guard: see `syncDrag`.
 */
export type DragState = { startX: number; startWidth: number; offset: number; last: DragSample | null; armed: boolean }

/** Drift tolerated before the column counts as having moved, px. */
export const REANCHOR_TOLERANCE_PX = 1

/** A new drag: the pointer at `pointerX`, the column `width` wide with its grip at `sample.gripX` (null where nothing can be measured). */
export function startDrag(pointerX: number, width: number, sample: DragSample | null): DragState {
  return { startX: pointerX, startWidth: width, offset: sample ? pointerX - sample.gripX : 0, last: sample, armed: true }
}

/** How far the grip is from where the width change since `prev` puts it: 0 for a column on a fixed anchor (centre when symmetric, left edge otherwise). */
export function gripDrift(prev: DragSample, now: DragSample, symmetric: boolean): number {
  return now.gripX - (prev.gripX + (now.width - prev.width) / (symmetric ? 2 : 1))
}

/**
 * Re-anchor a drag when the column moved under the held pointer (a sidebar collapsing, a layout re-centring). `now` is the current
 * measurement of the rendered column and `width` the width last given to `onChange`. When the grip is not where the width change
 * explains, the drag restarts from the grip's measured place: `startX` = grip + `offset` and `startWidth` = `width`, so the next
 * mapping keeps the pointer-to-grip distance of the press and the grip catches up with the pointer.
 *
 * Loop guard: a layout that moves in response to the width itself (a sliding column pinned by a side panel) shows drift on every
 * move, and re-anchoring on each would add the lag to the width again and again. So a re-anchor disarms the guard, and drift is
 * only acted on again after one measurement that the width explains (drift within tolerance). A response layout therefore costs one
 * re-anchor per drag, and the mapping stays a plain function of the pointer after it.
 */
export function syncDrag(state: DragState, now: DragSample, width: number, symmetric: boolean, tolerance = REANCHOR_TOLERANCE_PX): { state: DragState; reanchored: boolean } {
  if (!state.last) return { state: { ...state, last: now }, reanchored: false }
  if (Math.abs(gripDrift(state.last, now, symmetric)) <= tolerance) return { state: { ...state, last: now, armed: true }, reanchored: false }
  if (!state.armed) return { state: { ...state, last: now }, reanchored: false }
  return { state: { ...state, startX: now.gripX + state.offset, startWidth: width, last: now, armed: false }, reanchored: true }
}
