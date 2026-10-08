export type ToastVariant = "neutral" | "success" | "warning" | "danger"

export interface ToastInput {
  variant?: ToastVariant
  title: string
  text?: string
}

export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  text?: string
}

export const MAX_TOASTS = 3
export const AUTO_DISMISS_MS = 6000

/** The time a toast of this variant stays, or `null` when it stays until dismissed. */
export function autoDismissMs(variant: ToastVariant): number | null {
  return variant === "success" || variant === "neutral" ? AUTO_DISMISS_MS : null
}

export interface ToastQueue {
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  getSnapshot: () => readonly ToastItem[]
  subscribe: (listener: () => void) => () => void
  /** Stops a toast's countdown, keeping the time left. A no-op for a toast with no countdown or one already paused. */
  pause: (id: string) => void
  /** Restarts a paused countdown with the time left. A no-op when the toast is not paused. */
  resume: (id: string) => void
  /** Clears every timer and listener (the Toaster calls it on unmount). */
  dispose: () => void
}

/**
 * Pause on hover and focus (WCAG 2.2.1): a toast's countdown is held while the pointer is over it or focus is inside it,
 * and resumes only when neither is. Pure, so the unit tests drive it without a DOM.
 */
export function createPauseGate(queue: Pick<ToastQueue, "pause" | "resume">, id: string) {
  let pointer = false
  let focus = false
  const sync = () => (pointer || focus ? queue.pause(id) : queue.resume(id))
  return {
    pointer(inside: boolean) {
      pointer = inside
      sync()
    },
    focus(inside: boolean) {
      focus = inside
      sync()
    },
  }
}

export function createToastQueue(options: { max?: number } = {}): ToastQueue {
  const max = options.max ?? MAX_TOASTS
  let items: readonly ToastItem[] = []
  let counter = 0
  interface Countdown {
    timer: ReturnType<typeof setTimeout> | null
    startedAt: number
    remaining: number
  }
  const timers = new Map<string, Countdown>()
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  const clearTimer = (id: string) => {
    const countdown = timers.get(id)
    if (countdown?.timer != null) clearTimeout(countdown.timer)
    timers.delete(id)
  }
  const dismiss = (id: string) => {
    clearTimer(id)
    if (!items.some((item) => item.id === id)) return
    items = items.filter((item) => item.id !== id)
    emit()
  }

  const start = (id: string, remaining: number) => {
    timers.set(id, { timer: setTimeout(() => dismiss(id), remaining), startedAt: Date.now(), remaining })
  }

  return {
    pause(id) {
      const countdown = timers.get(id)
      if (!countdown || countdown.timer === null) return
      clearTimeout(countdown.timer)
      timers.set(id, { timer: null, startedAt: 0, remaining: Math.max(0, countdown.remaining - (Date.now() - countdown.startedAt)) })
    },
    resume(id) {
      const countdown = timers.get(id)
      if (!countdown || countdown.timer !== null) return
      start(id, countdown.remaining)
    },
    dispose() {
      for (const id of [...timers.keys()]) clearTimer(id)
      listeners.clear()
    },
    push(input) {
      counter += 1
      const item: ToastItem = { id: `toast-${counter}`, variant: input.variant ?? "neutral", title: input.title, ...(input.text ? { text: input.text } : {}) }
      const next = [...items, item]
      for (const dropped of next.slice(0, Math.max(0, next.length - max))) clearTimer(dropped.id)
      items = next.slice(-max)
      const ms = autoDismissMs(item.variant)
      if (ms !== null) start(item.id, ms)
      emit()
      return item.id
    },
    dismiss,
    getSnapshot: () => items,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
