import * as React from "react"

/**
 * An uncontrolled control that keeps its own state (Switch, Checkbox) must go back to its initial value when its form resets,
 * as a native input and the Radix controls do. With no `formId` it listens on the closest `<form>`; with a `formId` (the `form`
 * attribute) it listens for `reset` events at the document and matches the form by id, so a form that mounts after the control
 * still resets it. The listener is removed on unmount. Pass `enabled` false for a controlled control: the app owns its state.
 * Returns the control's ref callback, memoised, which also forwards the caller's own `ref`.
 */
export function useFormReset<T extends HTMLElement>(
  formId: string | undefined,
  enabled: boolean,
  onReset: () => void,
  forwarded?: React.Ref<T>,
): React.RefCallback<T> {
  const [element, setElement] = React.useState<T | null>(null)
  const latest = React.useRef(onReset)
  React.useEffect(() => {
    latest.current = onReset
  })
  React.useEffect(() => {
    if (!enabled || !element) return
    if (formId) {
      const doc = element.ownerDocument
      const handle = (event: Event) => {
        if ((event.target as HTMLElement | null)?.id === formId) latest.current()
      }
      doc.addEventListener("reset", handle, true)
      return () => doc.removeEventListener("reset", handle, true)
    }
    const form = element.closest("form")
    if (!form) return
    const handle = () => latest.current()
    form.addEventListener("reset", handle)
    return () => form.removeEventListener("reset", handle)
  }, [element, formId, enabled])
  // eslint-disable-next-line react-hooks/immutability -- writing a forwarded ref object's `current` is the ref contract
  return React.useCallback(
    (node: T | null) => {
      setElement(node)
      if (typeof forwarded === "function") forwarded(node)
      // eslint-disable-next-line react-hooks/immutability -- writing a forwarded ref object's `current` is the ref contract
      else if (forwarded) forwarded.current = node
    },
    [forwarded],
  )
}
