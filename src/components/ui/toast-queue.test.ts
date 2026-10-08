import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DISMISS_MS, MAX_TOASTS, autoDismissMs, createPauseGate, createToastQueue, type ToastQueue } from "./toast-queue"

// US-202 (NFR-013): the pure toast queue under fake timers.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const titles = (q: ToastQueue) => q.getSnapshot().map((t) => t.title)

/** The cap check the story's scenario runs: two successes then two more leaves the last three. */
function capHolds(q: ToastQueue): boolean {
  for (const title of ["one", "two", "three", "four"]) q.push({ variant: "success", title })
  return q.getSnapshot().length <= 3 && titles(q).join() === "two,three,four"
}

describe("US-202: the toast queue", () => {
  it("the numbers are 3 and 6000", () => {
    expect(MAX_TOASTS).toBe(3)
    expect(AUTO_DISMISS_MS).toBe(6000)
    expect(autoDismissMs("success")).toBe(6000)
    expect(autoDismissMs("neutral")).toBe(6000)
    expect(autoDismissMs("warning")).toBeNull()
    expect(autoDismissMs("danger")).toBeNull()
  })

  it("a fourth toast drops the oldest, leaving the last three", () => {
    const q = createToastQueue()
    expect(capHolds(q)).toBe(true)
  })

  it("M2: a queue built with cap 4 fails the cap check", () => {
    expect(capHolds(createToastQueue({ max: 4 }))).toBe(false)
  })

  it("a success toast stays at 5999 ms and goes at 6000 ms; neutral the same", () => {
    for (const variant of ["success", "neutral"] as const) {
      const q = createToastQueue()
      q.push({ variant, title: "t" })
      vi.advanceTimersByTime(5999)
      expect(q.getSnapshot()).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(q.getSnapshot()).toHaveLength(0)
    }
  })

  it("a warning and a danger toast are still there after an hour", () => {
    const q = createToastQueue()
    q.push({ variant: "warning", title: "w" })
    q.push({ variant: "danger", title: "d" })
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(titles(q)).toEqual(["w", "d"])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("dismiss removes exactly that toast and clears its timer; an unknown id is a no-op", () => {
    const q = createToastQueue()
    const a = q.push({ variant: "success", title: "a" })
    q.push({ variant: "warning", title: "b" })
    const c = q.push({ variant: "success", title: "c" })
    q.dismiss(a)
    expect(titles(q)).toEqual(["b", "c"])
    expect(vi.getTimerCount()).toBe(1)
    q.dismiss("nope")
    expect(titles(q)).toEqual(["b", "c"])
    q.dismiss(c)
    expect(titles(q)).toEqual(["b"])
  })

  it("a dropped toast takes its timer with it, and a later one is not removed early", () => {
    const q = createToastQueue()
    for (const title of ["1", "2", "3", "4"]) q.push({ variant: "success", title })
    expect(vi.getTimerCount()).toBe(3)
    vi.advanceTimersByTime(6000)
    expect(q.getSnapshot()).toHaveLength(0)
  })

  it("variant defaults to neutral, text is kept only when given, ids are unique", () => {
    const q = createToastQueue()
    const a = q.push({ title: "a", text: "more" })
    const b = q.push({ title: "b" })
    expect(a).not.toBe(b)
    expect(q.getSnapshot()[0]).toMatchObject({ variant: "neutral", title: "a", text: "more" })
    expect(q.getSnapshot()[1]).not.toHaveProperty("text")
  })

  it("subscribers hear every change, and stop after unsubscribing; the snapshot is stable between changes", () => {
    const q = createToastQueue()
    const listener = vi.fn()
    const off = q.subscribe(listener)
    const id = q.push({ title: "a", variant: "danger" })
    expect(q.getSnapshot()).toBe(q.getSnapshot())
    q.dismiss(id)
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    q.push({ title: "b" })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("pause keeps the time left: hover at 3 s, 10 s later it is still there; resume, 2999 ms keeps it, 3000 ms removes it", () => {
    const q = createToastQueue()
    const id = q.push({ variant: "success", title: "t" })
    vi.advanceTimersByTime(3000)
    q.pause(id)
    vi.advanceTimersByTime(10_000)
    expect(q.getSnapshot()).toHaveLength(1)
    q.resume(id)
    vi.advanceTimersByTime(2999)
    expect(q.getSnapshot()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(q.getSnapshot()).toHaveLength(0)
  })

  it("pause and resume are idempotent and affect only that toast; warning and danger are unaffected", () => {
    const q = createToastQueue()
    const a = q.push({ variant: "success", title: "a" })
    const b = q.push({ variant: "neutral", title: "b" })
    const w = q.push({ variant: "warning", title: "w" })
    q.pause(a)
    q.pause(a)
    q.pause(w)
    q.resume(w)
    q.resume(b)
    vi.advanceTimersByTime(6000)
    expect(titles(q)).toEqual(["a", "w"])
    q.resume(a)
    q.resume(a)
    vi.advanceTimersByTime(6000)
    expect(titles(q)).toEqual(["w"])
  })

  it("dismissing or dropping a paused toast leaves no timer or revival", () => {
    const q = createToastQueue()
    const a = q.push({ variant: "success", title: "a" })
    q.pause(a)
    q.dismiss(a)
    q.resume(a)
    expect(q.getSnapshot()).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("the pause gate holds while the pointer is over or focus is inside, and resumes only when neither is", () => {
    const q = createToastQueue()
    const id = q.push({ variant: "success", title: "t" })
    const gate = createPauseGate(q, id)
    gate.pointer(true)
    gate.focus(true)
    gate.pointer(false)
    vi.advanceTimersByTime(60_000)
    expect(q.getSnapshot()).toHaveLength(1)
    gate.focus(false)
    vi.advanceTimersByTime(6000)
    expect(q.getSnapshot()).toHaveLength(0)
  })

  it("dispose clears every timer and listener", () => {
    const q = createToastQueue()
    const listener = vi.fn()
    q.subscribe(listener)
    q.push({ variant: "success", title: "a" })
    const b = q.push({ variant: "success", title: "b" })
    q.pause(b)
    listener.mockClear()
    q.dispose()
    expect(vi.getTimerCount()).toBe(0)
    q.push({ title: "c" })
    expect(listener).not.toHaveBeenCalled()
  })

  it("pause keeps the time left, not half and not the full time: paused at 1 s, 5 s remain", () => {
    const q = createToastQueue()
    const id = q.push({ variant: "success", title: "t" })
    vi.advanceTimersByTime(1000)
    q.pause(id)
    vi.advanceTimersByTime(60_000)
    q.resume(id)
    vi.advanceTimersByTime(4999)
    expect(q.getSnapshot()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(q.getSnapshot()).toHaveLength(0)
  })

  it("a second pause/resume cycle subtracts only the time actually run", () => {
    const q = createToastQueue()
    const id = q.push({ variant: "neutral", title: "t" })
    vi.advanceTimersByTime(2000)
    q.pause(id)
    q.resume(id)
    vi.advanceTimersByTime(1000)
    q.pause(id)
    vi.advanceTimersByTime(30_000)
    q.resume(id)
    vi.advanceTimersByTime(2999)
    expect(q.getSnapshot()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(q.getSnapshot()).toHaveLength(0)
  })

  describe("the pause gate, against naive gates that must fail the same scenarios", () => {
    type Gate = { pointer(inside: boolean): void; focus(inside: boolean): void }
    /** Overlap: pointer in, focus in, pointer out; the toast must still be held. Then focus out; it must run out. */
    function overlapHolds(make: (q: ToastQueue, id: string) => Gate): boolean {
      const q = createToastQueue()
      const id = q.push({ variant: "success", title: "t" })
      const gate = make(q, id)
      gate.pointer(true)
      gate.focus(true)
      gate.pointer(false)
      vi.advanceTimersByTime(60_000)
      const heldWhileFocused = q.getSnapshot().length === 1
      gate.focus(false)
      vi.advanceTimersByTime(6000)
      return heldWhileFocused && q.getSnapshot().length === 0
    }
    /** Mutation: each event resumes or pauses on its own, ignoring the other source. */
    const naive = (q: ToastQueue, id: string): Gate => ({
      pointer: (inside) => (inside ? q.pause(id) : q.resume(id)),
      focus: (inside) => (inside ? q.pause(id) : q.resume(id)),
    })
    /** Mutation: only the pointer is honoured. */
    const pointerOnly = (q: ToastQueue, id: string): Gate => ({ pointer: naive(q, id).pointer, focus: () => undefined })

    it("the real gate holds the overlap", () => expect(overlapHolds((q, id) => createPauseGate(q, id))).toBe(true))
    it("M-gate: a gate where the last event wins fails the overlap scenario", () => expect(overlapHolds(naive)).toBe(false))
    it("M-gate: a pointer-only gate fails it too", () => expect(overlapHolds(pointerOnly)).toBe(false))

    it("keyboard only: focus in holds, focus out resumes with the time left", () => {
      const q = createToastQueue()
      const id = q.push({ variant: "success", title: "t" })
      const gate = createPauseGate(q, id)
      vi.advanceTimersByTime(4000)
      gate.focus(true)
      vi.advanceTimersByTime(60_000)
      expect(q.getSnapshot()).toHaveLength(1)
      gate.focus(false)
      vi.advanceTimersByTime(1999)
      expect(q.getSnapshot()).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(q.getSnapshot()).toHaveLength(0)
    })
  })

  it("dispose: a fixture queue that leaves its timers fails the same check the real one passes", () => {
    const check = (dispose: (q: ToastQueue) => void): number => {
      const q = createToastQueue()
      q.push({ variant: "success", title: "a" })
      q.push({ variant: "success", title: "b" })
      dispose(q)
      return vi.getTimerCount()
    }
    expect(check((q) => q.dispose())).toBe(0)
    expect(check(() => undefined)).toBe(2)
  })
})
