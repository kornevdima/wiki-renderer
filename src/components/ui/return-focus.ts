import * as React from "react"

/**
 * Focus return for every ESG modal layer (Dialog, Drawer, CommandPalette, ShortcutsSheet): brand book, Admin apps › Keyboard,
 * "Esc closes the top layer and returns focus to the control that opened it".
 *
 * Radix Dialog returns focus only to its own `Dialog.Trigger`. A layer opened without one (a controlled `open`, ⌘K from a text
 * field, a row click) would drop focus on `<body>` (found by Outreach's slice 3 e2e on v30). So the layer remembers the
 * focused element when it opens and focuses it again when it closes.
 *
 * Capture happens in Radix's `onOpenAutoFocus`: it fires inside the focus scope's mount, before focus moves into the layer, so
 * `document.activeElement` is still the opener. (A parent effect on `open` would run after the child scope has already moved
 * focus.) Restore happens in `onCloseAutoFocus`: if the opener is still in the document, Radix's own attempt is prevented and
 * the opener is focused; otherwise Radix falls back (its trigger, if any). A caller's own `onCloseAutoFocus` that prevents the
 * event wins. No "use client": the pure parts are plain functions, tested without a DOM.
 */
export type FocusTarget = { focus: (options?: FocusOptions) => void; isConnected?: boolean }
type DocumentLike = { activeElement: unknown; body?: unknown }
type AutoFocusEvent = { preventDefault: () => void; defaultPrevented: boolean }

/** The element that has focus, if it can take focus again; never `<body>` or nothing. */
export function focusedElement(doc: DocumentLike | null | undefined): FocusTarget | null {
  const active = doc?.activeElement as FocusTarget | null | undefined
  if (!active || active === doc?.body || typeof active.focus !== "function") return null
  return active
}

export type ReturnFocus = {
  /** Remember the focused element (call as the layer opens). */
  capture: (doc?: DocumentLike | null) => void
  /** Focus it again (call as the layer closes). Returns whether it did. */
  restore: (event: AutoFocusEvent) => boolean
}

export function createReturnFocus(): ReturnFocus {
  let target: FocusTarget | null = null
  return {
    capture(doc = typeof document === "undefined" ? null : document) {
      target = focusedElement(doc)
    },
    restore(event) {
      const opener = target
      target = null
      if (event.defaultPrevented || !opener || opener.isConnected === false) return false
      event.preventDefault()
      opener.focus()
      return true
    },
  }
}

type AutoFocusHandlers<E extends AutoFocusEvent> = {
  onOpenAutoFocus?: (event: E) => void
  onCloseAutoFocus?: (event: E) => void
}

/**
 * The two Radix content handlers with focus return composed in: spread the result on `DialogPrimitive.Content`. The caller's
 * own handlers still run (open: after the capture; close: first, so it can prevent the restore).
 */
export function useReturnFocus<E extends AutoFocusEvent>(handlers: AutoFocusHandlers<E> = {}): Required<AutoFocusHandlers<E>> {
  const [returnFocus] = React.useState(createReturnFocus)
  const { onOpenAutoFocus, onCloseAutoFocus } = handlers
  return {
    onOpenAutoFocus: (event) => {
      returnFocus.capture()
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event) => {
      onCloseAutoFocus?.(event)
      returnFocus.restore(event)
    },
  }
}
