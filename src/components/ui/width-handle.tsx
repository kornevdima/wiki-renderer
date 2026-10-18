"use client"

import * as React from "react"

import { HIT_AREA_COARSE_CLASS } from "@/components/ui/hit-area"
import { cn } from "@/lib/utils"
import {
  DEFAULT_SNAP_PX,
  KEY_STEP_LARGE_PX,
  KEY_STEP_PX,
  clampWidth,
  defaultValueText,
  estimateChipWidth,
  guideAt,
  intersectRoom,
  markerOffsets,
  nextGuide,
  gripSegment,
  placeGripReadout,
  placeGripLabels,
  placeTopLabels,
  prevGuide,
  snapWidth,
  startDrag,
  stepWidth,
  syncDrag,
  visibleGuides,
  widthFromDrag,
} from "@/components/ui/width-handle-model"
import type { Available, DragState, GripGeometry, WidthGuide } from "@/components/ui/width-handle-model"

/**
 * The design system's WidthHandle (`project/components/WidthHandle`, added 2026-10-17 for the wiki renderer's page width, US-280):
 * a vertical drag handle on the right edge of a column, with snap guides. Controlled and generic: the app supplies the guides,
 * their labels and what a width means (A4, a measure, a breakpoint); the component knows nothing about any of them.
 *
 * Mounting: render it as a child of a `position: relative` wrapper that is exactly the column (its width is `value`). It fills the
 * wrapper (`absolute inset-0`, pointer events off except the handle), puts the handle on the wrapper's right edge, and draws the
 * guide markers over the wrapper (labels in a ruler row above the column, the readout below it, clear of the focus ring) while the handle is dragged or focused. The wrapper must not clip overflow (markers can sit
 * outside the column). With `symmetric` (default) the column is centred, so a drag of dx px changes the width by 2·dx and each
 * guide shows on both sides of the centre. The component never sets the column's width: the app does, from `onChange`.
 */
type WidthHandleProps = {
  /** The column's width, px. */
  value: number
  /** Called on every drag move and key press with the new width and the guide it is snapped to (null: none). */
  onChange: (px: number, guideId: string | null) => void
  /** Called when a drag ends and after each key press: persist here. */
  onCommit?: (px: number, guideId: string | null) => void
  min: number
  /** The app computes this from the window. */
  max: number
  /** Guides outside [min, max] are not shown, snapped to or stepped to. */
  guides: readonly WidthGuide[]
  /** Within this many px of a guide a drag snaps to it. Default 8. */
  snapPx?: number
  /** The accessible name ("Page width"). */
  label: string
  /** The text for aria-valuetext and the readout chip. Default: the guide's label with the width, or the width. */
  formatValue?: (px: number, guide: WidthGuide | null) => string
  /** Home goes to the guide with this id (if it exists in `guides`), then calls `onReset`. */
  resetTo?: string
  onReset?: () => void
  /**
   * Where the guide labels and the readout go. "top" (default): labels in a ruler row above the column (staggered into more rows
   * where they would collide), the readout below it. "grip": at the grip's height. Guide lines are 160px segments centred on the
   * grip's bar (measured, so a sticky grip is followed as the page scrolls), each label sits at the top of its segment beside the line on
   * the side away from the grip (clear of the focus ring), and the readout is just below the grip. All of it stays in the viewport while the grip is.
   */
  labelsAt?: "top" | "grip"
  /** Draw the mirrored guide lines on the column's start side. Default: `symmetric` (a column anchored at its left edge has none). */
  startMarkers?: boolean
  /**
   * The room the guide labels and the readout may use, when the viewport is too wide (a side panel beside the column). Either an
   * element (a ref to it: its bounding box is read each time the guides are measured) or a `{ left, right }` range in viewport px
   * (`getBoundingClientRect` coordinates). It narrows the measured room (viewport and clipping ancestors); a chip that would leave
   * it flips or is clamped inside. Absent: unchanged.
   */
  labelRoom?: React.RefObject<HTMLElement | null> | Available
  /** The handle is on the right edge. Only "end" exists. */
  side?: "end"
  /** The column is centred, so a drag of dx changes the width by 2·dx and guides show on both sides. Default true. */
  symmetric?: boolean
  className?: string
}

const MARKER_LINE = "absolute w-px -translate-x-1/2 transition-colors duration-(--duration-fast) ease-(--ease-standard) motion-reduce:transition-none"
/** A chip row is a chip's height (24px) and a gap (8px). In grip mode a chip sits beside its line, never inside the ring box (placeGripLabels). */
const ROW_PITCH = "var(--space-24) + var(--space-8)"
const CHIP =
  "absolute rounded-(--ds-radius-sm) border border-border px-2 py-0.5 text-caption whitespace-nowrap transition-colors duration-(--duration-fast) ease-(--ease-standard) motion-reduce:transition-none"

/**
 * The room chips have, in px from the root's left edge: the viewport, narrowed by every ancestor that clips horizontally.
 * Undefined where nothing can be measured (no layout, as in a test DOM).
 */
function measureAvailable(root: HTMLElement | null, labelRoom?: WidthHandleProps["labelRoom"]): Available | undefined {
  if (!root || typeof window === "undefined") return undefined
  const origin = root.getBoundingClientRect().left
  let left = 0
  let right = document.documentElement.clientWidth
  for (let el = root.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (getComputedStyle(el).overflowX === "visible") continue
    const r = el.getBoundingClientRect()
    left = Math.max(left, r.left)
    right = Math.min(right, r.right)
  }
  const measured = right > left ? { left, right } : undefined
  let room: Available | undefined
  if (labelRoom) {
    if ("current" in labelRoom) {
      const r = labelRoom.current?.getBoundingClientRect()
      room = r ? { left: r.left, right: r.right } : undefined
    } else room = labelRoom
  }
  const joined = intersectRoom(measured, room)
  return joined ? { left: joined.left - origin, right: joined.right - origin } : undefined
}

// Styling only: a pointer drag shows the same ring as keyboard focus (the theme ring's colour, width and offset, from its base rule); mouse focus is not :focus-visible, so nothing else applies to it.
/** `el.matches(":focus-visible")`, false where the engine cannot say. */
function matchesFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible")
  } catch {
    return false
  }
}

function WidthHandle({
  value,
  onChange,
  onCommit,
  min,
  max,
  guides,
  snapPx = DEFAULT_SNAP_PX,
  label,
  formatValue,
  resetTo,
  onReset,
  side = "end",
  symmetric = true,
  labelsAt = "top",
  startMarkers = symmetric,
  labelRoom,
  className,
}: WidthHandleProps) {
  const [dragging, setDragging] = React.useState(false)
  // Guides show while dragging, and while the grip matches :focus-visible (keyboard focus, or a key press); never on any focus.
  const [keyboard, setKeyboard] = React.useState(false)
  const drag = React.useRef<DragState | null>(null)
  const pointerX = React.useRef(0)
  const latest = React.useRef<{ px: number; guideId: string | null }>({ px: value, guideId: null })

  const shown = React.useMemo(() => visibleGuides(guides, min, max), [guides, min, max])
  const current = clampWidth(value, min, max)
  const snapped = guideAt(current, shown)
  const text = (formatValue ?? defaultValueText)(current, snapped)
  // The visible readout is the width alone: a snapped guide's highlighted label carries its name (aria-valuetext keeps both).
  const readout = (formatValue ?? defaultValueText)(current, null)
  const active = dragging || keyboard
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const gripRef = React.useRef<HTMLDivElement | null>(null)
  const barRef = React.useRef<HTMLSpanElement | null>(null)
  const [geometry, setGeometry] = React.useState<GripGeometry>({ barY: 0, gripTop: 0, gripBottom: 0, columnHeight: 0 })
  const [available, setAvailable] = React.useState<Available | undefined>(undefined)
  // Measured when the guides show, whenever the column moves and while the page scrolls or resizes (a host may make the grip sticky):
  // the room the chips have (viewport and scroll containers) and where the grip's bar is.
  const measure = React.useCallback(() => {
    const nextAvailable = measureAvailable(rootRef.current, labelRoom)
    setAvailable((prev) => (prev?.left === nextAvailable?.left && prev?.right === nextAvailable?.right ? prev : nextAvailable))
    const root = rootRef.current?.getBoundingClientRect()
    const grip = gripRef.current?.getBoundingClientRect()
    const bar = barRef.current?.getBoundingClientRect()
    if (!root || !grip || !bar) return
    const next = { barY: bar.top + bar.height / 2 - root.top, gripTop: grip.top - root.top, gripBottom: grip.bottom - root.top, columnHeight: root.height }
    setGeometry((prev) => (prev.barY === next.barY && prev.gripTop === next.gripTop && prev.gripBottom === next.gripBottom && prev.columnHeight === next.columnHeight ? prev : next))
  }, [labelRoom])
  React.useLayoutEffect(() => {
    if (!active) return
    measure()
  }, [active, current, labelsAt, guides, labelRoom, measure])
  React.useEffect(() => {
    if (!active) return
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    return () => {
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [active, measure])
  const centred = labelsAt === "top"
  const widths = shown.map((g) => ({ id: g.id, x: markerOffsets(g.px, current, symmetric).end, width: estimateChipWidth(g.label) }))
  const segment = gripSegment(geometry.barY, geometry.columnHeight)
  const lineStyle = (left: number): React.CSSProperties => (centred ? { left } : { left, top: segment.top, height: segment.height })
  const readoutAt = placeGripReadout(geometry, current, estimateChipWidth(readout), available)
  const placed: Record<string, { left: number; row: number }> = {}
  for (const p of centred ? placeTopLabels(widths, 8, available) : placeGripLabels(widths, current, 8, available)) placed[p.id] = p

  // No text selection while dragging; the pointer capture keeps the events on the handle. Both properties: WebKit (Safari) only
  // honours `-webkit-user-select` here, so the unprefixed one alone leaves the article text selectable (BUG-065).
  React.useEffect(() => {
    if (!dragging) return
    const { style } = document.body
    const previous = { standard: style.userSelect, webkit: style.webkitUserSelect }
    style.userSelect = "none"
    style.webkitUserSelect = "none"
    // WebKit still starts a selection inside an editable region (a contenteditable the pointer sweeps over) whatever the body's
    // user-select says, so the selection start is cancelled too. Tied to `dragging`, which a non-primary press never sets, so the
    // cancel is on only for the length of a drag and the same cleanup that restores the body takes it off (release, cancel, lost
    // capture, unmount).
    const refuse = (event: Event) => event.preventDefault()
    document.addEventListener("selectstart", refuse, true)
    return () => {
      document.removeEventListener("selectstart", refuse, true)
      style.userSelect = previous.standard
      style.webkitUserSelect = previous.webkit
    }
  }, [dragging])

  const emit = (px: number, guideId: string | null) => {
    latest.current = { px, guideId }
    onChange(px, guideId)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    // No preventDefault and no focus(): the browser focuses the grip natively on a mouse press (not :focus-visible, so no ring) and
    // text selection is stopped by select-none and touch-none on the grip.
    setKeyboard(false)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointerX.current = e.clientX
    latest.current = { px: current, guideId: snapped?.id ?? null }
    drag.current = startDrag(e.clientX, current, sampleColumn())
    setDragging(true)
  }
  // Where the rendered column's grip is (its right edge) and how wide it is, or null where there is no layout or the app has not
  // rendered the last width yet (a stale measurement must not read as the column moving).
  const sampleColumn = () => {
    const r = rootRef.current?.getBoundingClientRect()
    if (!r || !(r.width > 0)) return null
    return { gripX: r.right, width: r.width }
  }
  // Follow the pointer; first re-anchor the drag if the column moved under it (see syncDrag).
  const followPointer = (clientX: number) => {
    let d = drag.current
    if (!d) return
    const sample = sampleColumn()
    if (sample && Math.abs(sample.width - latest.current.px) <= 1) {
      d = syncDrag(d, sample, latest.current.px, symmetric).state
      drag.current = d
    }
    const next = snapWidth(widthFromDrag(d.startWidth, clientX - d.startX, symmetric), min, max, shown, snapPx)
    if (next.px !== latest.current.px || next.guideId !== latest.current.guideId) emit(next.px, next.guideId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerX.current = e.clientX
    followPointer(e.clientX)
  }
  // A column can move with the pointer held still (a sidebar collapsing): re-check when the column's surroundings resize.
  const followRef = React.useRef(followPointer)
  React.useEffect(() => {
    followRef.current = followPointer
  })
  React.useEffect(() => {
    if (!dragging || typeof ResizeObserver === "undefined") return
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(() => {
      followRef.current(pointerX.current)
      measure()
    })
    observer.observe(root)
    if (root.parentElement) observer.observe(root.parentElement)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [dragging, measure])
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    setKeyboard(false)
    onCommit?.(latest.current.px, latest.current.guideId)
  }

  const setTo = (px: number, guide: WidthGuide | null) => {
    const next = clampWidth(px, min, max)
    const id = guide && guide.px === next ? guide.id : (guideAt(next, shown)?.id ?? null)
    emit(next, id)
    onCommit?.(next, id)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key.startsWith("Arrow") || e.key.startsWith("Page") || e.key === "Home") {
      setKeyboard(true)
    }
    const step = e.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX
    let handled = true
    switch (e.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        const r = stepWidth(current, e.key === "ArrowRight" ? step : -step, shown, snapPx, min, max)
        setTo(r.px, shown.find((g) => g.id === r.guideId) ?? null)
        break
      }
      case "PageUp": {
        const g = nextGuide(current, shown)
        if (g) setTo(g.px, g)
        break
      }
      case "PageDown": {
        const g = prevGuide(current, shown)
        if (g) setTo(g.px, g)
        break
      }
      case "Home": {
        const g = resetTo ? guides.find((x) => x.id === resetTo) : undefined
        if (g) setTo(g.px, g)
        onReset?.()
        break
      }
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  return (
    <div ref={rootRef} data-slot="width-handle" data-side={side} data-active={active || undefined} className={cn("pointer-events-none absolute inset-0 print:hidden", className)}>
      {active ? (
        <div data-slot="width-handle-guides" aria-hidden="true" className="absolute inset-0">
          {shown.map((g) => {
            const on = snapped?.id === g.id
            const at = markerOffsets(g.px, current, symmetric)
            const row = placed[g.id]?.row ?? 0
            const lineClass = cn(MARKER_LINE, centred && "inset-y-0", on ? "bg-primary" : "bg-border-strong")
            return (
              <React.Fragment key={g.id}>
                {startMarkers ? <span data-slot="width-handle-guide" data-side="start" data-guide={g.id} data-snapped={on || undefined} style={lineStyle(at.start)} className={lineClass} /> : null}
                <span data-slot="width-handle-guide" data-side="end" data-guide={g.id} data-snapped={on || undefined} style={lineStyle(at.end)} className={lineClass} />
                <span
                  data-slot="width-handle-guide-label"
                  data-row={row}
                  style={{
                    left: placed[g.id]?.left ?? at.end,
                    ...(centred ? { bottom: `calc(100% + var(--space-8) + ${row} * (${ROW_PITCH}))` } : { top: `calc(${segment.top}px + ${row} * (${ROW_PITCH}))` }),
                  }}
                  className={cn(CHIP, on ? "border-primary bg-primary font-bold text-on-primary" : "bg-surface-raised text-ink-secondary")}
                >
                  {g.label}
                </span>
              </React.Fragment>
            )
          })}
          <span
            data-slot="width-handle-readout"
            style={readoutAt}
            className={cn(CHIP, "z-(--z-sticky) font-bold", snapped ? "border-primary bg-primary text-on-primary" : "bg-surface-raised text-foreground")}
          >
            {readout}
          </span>
        </div>
      ) : null}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={Math.max(min, max)}
        aria-valuenow={Math.round(current)}
        aria-valuetext={text}
        ref={gripRef}
        data-slot="width-handle-grip"
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        onFocus={(e) => setKeyboard(matchesFocusVisible(e.currentTarget))}
        onBlur={() => {
          setKeyboard(false)
        }}
        className={cn(
          "group pointer-events-auto absolute top-1/2 right-0 flex h-[calc(var(--space-80)*2+var(--space-16))] w-6 translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center rounded-(--ds-radius-sm) outline-offset-2 select-none data-[dragging]:outline-solid",
          HIT_AREA_COARSE_CLASS,
        )}
      >
        <span
          ref={barRef}
          aria-hidden="true"
          className={cn(
            "h-10 w-1.5 rounded-full transition-colors duration-(--duration-fast) ease-(--ease-standard) group-hover:bg-primary group-focus-visible:bg-primary motion-reduce:transition-none",
            active ? "bg-primary" : "bg-border-strong",
          )}
        />
      </div>
      <span data-slot="width-handle-status" role="status" aria-live="polite" className="sr-only">
        {snapped ? text : ""}
      </span>
    </div>
  )
}

export { WidthHandle }
export type { WidthHandleProps, WidthGuide }
