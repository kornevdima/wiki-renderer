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
