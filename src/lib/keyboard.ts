import * as React from "react"

/**
 * The shared keyboard rules of every ESG admin app (brand book, Admin apps › Keyboard, ruled 2026-10-08), as pure functions
 * and one hook. No "use client" directive: the constants (`SHORTCUTS`) and the pure functions are safe to import from server
 * code; the hooks are only called from client components.
 *
 * - Keys are matched by their PHYSICAL position (`KeyboardEvent.code`: `KeyK`, `Slash`, `Enter`), so ⌘K works on a Ukrainian
 *   layout, where the K key types "л". The two printable global keys, `?` and `/`, also match the character they type
 *   (`ShortcutSpec.key`), because a layout may put that character on another key (standard Ukrainian: Shift 7 types "?",
 *   and the Slash key types "." and ",").
 * - `mod` is ⌘ (Meta) on macOS and iOS and Ctrl everywhere else. The other one never matches (Ctrl K on a Mac is the text
 *   fields' own "delete to end of line").
 * - Inside a text field (input, textarea, select, contenteditable) only Esc and the ⌘/Ctrl shortcuts act.
 * - Nothing acts while an input method is composing (`isComposing`, or keyCode 229).
 * - While a modal layer or a menu is open, a global shortcut does not act: the layer owns the keyboard (its own Esc and keys).
 *   A layer says it is open by carrying `data-esg-layer="modal"` (Dialog, Drawer, CommandPalette and ShortcutsSheet set it;
 *   an app's own modal can too); open Radix menus and listboxes are recognised by their role and `data-state="open"`.
 */

export type Platform = "apple" | "other"

export type ShortcutSpec = {
  /** The physical key or keys (`KeyboardEvent.code`): "KeyK", "Slash", ["Enter", "NumpadEnter"], "Escape". */
  code: string | readonly string[]
  /** ⌘ on Apple platforms, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /**
   * The character the key types, accepted as well as `code` for a printable key ("?", "/"), with whatever Shift the layout
   * needs for it. Never matches with ⌘, Ctrl or Alt held.
   */
  key?: string
}

/** The shared set (brand book, Admin apps › Keyboard). */
export const SHORTCUTS = {
  /** ⌘K / Ctrl K: open the command palette. Works inside text fields. */
  commandPalette: { code: "KeyK", mod: true },
  /** ?: open the keyboard shortcuts sheet. Shift+Slash by position, or any key that types "?". */
  shortcutsSheet: { code: "Slash", shift: true, key: "?" },
  /** /: focus the page's search or filter field. Slash by position, or any key that types "/". */
  focusSearch: { code: "Slash", key: "/" },
  /** ⌘↩ / Ctrl Enter: submit from a textarea or anywhere in a dialog. */
  submit: { code: ["Enter", "NumpadEnter"], mod: true },
  /** Esc: close the top layer. */
  close: { code: "Escape" },
} as const satisfies Record<string, ShortcutSpec>

/** The parts of a KeyboardEvent the rules read; a plain object in tests. */
export type KeyEventLike = {
  code: string
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  keyCode?: number
  repeat?: boolean
  defaultPrevented?: boolean
  target?: unknown
}

type NavigatorLike = { platform?: string; userAgent?: string; userAgentData?: { platform?: string } }

/** "apple" on macOS, iOS and iPadOS (which reports "MacIntel"); "other" elsewhere and on the server. */
export function detectPlatform(nav?: NavigatorLike | null): Platform {
  const source = nav === undefined ? (typeof navigator === "undefined" ? null : (navigator as NavigatorLike)) : nav
  if (!source) return "other"
  const name = source.userAgentData?.platform || source.platform || source.userAgent || ""
  return /mac|iphone|ipad|ipod/i.test(name) ? "apple" : "other"
}

function codesOf(spec: ShortcutSpec): readonly string[] {
  return typeof spec.code === "string" ? [spec.code] : spec.code
}

/** Whether the event is this shortcut: by physical key with exact modifiers, or (printable keys) by the character typed. */
export function matchShortcut(event: KeyEventLike, spec: ShortcutSpec, platform: Platform = detectPlatform()): boolean {
  const mod = platform === "apple" ? event.metaKey : event.ctrlKey
  const other = platform === "apple" ? event.ctrlKey : event.metaKey
  if (other || Boolean(spec.mod) !== mod || Boolean(spec.alt) !== event.altKey) return false
  if (codesOf(spec).includes(event.code) && Boolean(spec.shift) === event.shiftKey) return true
  return spec.key !== undefined && !spec.mod && !spec.alt && event.key === spec.key
}

/** An input method (IME) is composing: every shortcut waits. Safari reports keyCode 229 without `isComposing`. */
export function isComposing(event: Pick<KeyEventLike, "isComposing" | "keyCode">): boolean {
  return event.isComposing === true || event.keyCode === 229
}

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"])
const TEXT_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"])

type ElementLike = { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null }

/** A place where keys type text: a text input, a textarea, a select, contenteditable, or a textbox-like role. */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false
  const el = target as ElementLike
  const tag = (el.tagName ?? "").toUpperCase()
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((el.type || "text").toLowerCase())
  if (el.isContentEditable === true) return true
  const role = el.getAttribute?.("role")
  return role ? TEXT_ROLES.has(role) : false
}

/** Esc and the ⌘/Ctrl shortcuts act inside text fields by default; a printable key never does. */
export function allowedInFieldsByDefault(spec: ShortcutSpec): boolean {
  return spec.mod === true || codesOf(spec).includes("Escape")
}

/** The attribute an open modal layer carries, so global shortcuts stand down while it is open. */
export const LAYER_ATTRIBUTE = "data-esg-layer"
export const LAYER_MODAL = "modal"
/** Props that mark an element as an open modal layer: spread them on the layer's content. */
export const MODAL_LAYER_PROPS = { [LAYER_ATTRIBUTE]: LAYER_MODAL } as const
/** What counts as an open layer: an ESG modal layer, or an open Radix menu or listbox (they own their arrow keys and Esc). */
export const OPEN_LAYER_SELECTOR =
  '[data-esg-layer="modal"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'

/** Whether a modal layer or a menu is open in this document. */
export function isLayerOpen(root: { querySelector: (selector: string) => unknown } | null | undefined): boolean {
  return Boolean(root?.querySelector(OPEN_LAYER_SELECTOR))
}

export type ShortcutOptions = {
  /** Act inside text fields. Default: only Esc and ⌘/Ctrl shortcuts do. */
  allowInFields?: boolean
  /** Act while a modal layer or menu is open. Default false: the open layer owns the keyboard. */
  allowInLayer?: boolean
}

/** The whole rule for one keydown: matched, not handled already, not composing, not a key repeat, the field and layer rules. */
export function shortcutDecision(
  event: KeyEventLike,
  spec: ShortcutSpec,
  context: ShortcutOptions & { platform: Platform; layerOpen: () => boolean }
): boolean {
  if (event.defaultPrevented || event.repeat || isComposing(event)) return false
  if (!matchShortcut(event, spec, context.platform)) return false
  if (isTypingTarget(event.target) && !(context.allowInFields ?? allowedInFieldsByDefault(spec))) return false
  if (!context.allowInLayer && context.layerOpen()) return false
  return true
}

type ListenerRoot = {
  addEventListener: (type: "keydown", listener: (event: KeyboardEvent) => void) => void
  removeEventListener: (type: "keydown", listener: (event: KeyboardEvent) => void) => void
  querySelector: (selector: string) => unknown
}

/**
 * Listen for shortcuts on a document (or a fake one in tests). The first spec that passes `shortcutDecision` calls the handler
 * once, after `preventDefault` (unless `preventDefault: false`). Returns the cleanup.
 */
export function addShortcutListener(
  root: ListenerRoot,
  specs: readonly ShortcutSpec[],
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions & { preventDefault?: boolean; platform?: Platform } = {}
): () => void {
  const platform = options.platform ?? detectPlatform()
  const layerOpen = () => isLayerOpen(root)
  const listener = (event: KeyboardEvent) => {
    for (const spec of specs) {
      if (!shortcutDecision(event, spec, { ...options, platform, layerOpen })) continue
      if (options.preventDefault !== false) event.preventDefault()
      handler(event)
      return
    }
  }
  root.addEventListener("keydown", listener)
  return () => root.removeEventListener("keydown", listener)
}

export type UseShortcutOptions = ShortcutOptions & {
  /** Off while false (e.g. a page without a search field). Default true. */
  enabled?: boolean
  /** Default true: the key's browser action is cancelled once the shortcut acts. */
  preventDefault?: boolean
}

/**
 * A global shortcut: a document keydown listener, removed on unmount. The handler may change every render; the listener is
 * re-attached only when the spec or the options change.
 *
 *   useShortcut(SHORTCUTS.commandPalette, () => setPaletteOpen(true))
 *   useShortcut(SHORTCUTS.focusSearch, () => searchRef.current?.focus(), { enabled: hasSearch })
 */
export function useShortcut(
  spec: ShortcutSpec | readonly ShortcutSpec[],
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = {}
): void {
  const handlerRef = React.useRef(handler)
  React.useEffect(() => {
    handlerRef.current = handler
  })
  const { enabled = true, allowInFields, allowInLayer, preventDefault } = options
  const specsKey = JSON.stringify(Array.isArray(spec) ? spec : [spec])
  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") return
    const specs = JSON.parse(specsKey) as ShortcutSpec[]
    return addShortcutListener(document, specs, (event) => handlerRef.current(event), { allowInFields, allowInLayer, preventDefault })
  }, [enabled, specsKey, allowInFields, allowInLayer, preventDefault])
}

const noSubscription = () => () => {}

/** The viewer's platform: "other" on the server and during hydration, then the real one, so the markup never mismatches. */
export function usePlatform(): Platform {
  return React.useSyncExternalStore(noSubscription, () => detectPlatform(), () => "other" as const)
}

const KEY_NAMES: Record<string, { apple: string; other: string; aria: string }> = {
  Enter: { apple: "↩", other: "Enter", aria: "Enter" },
  NumpadEnter: { apple: "↩", other: "Enter", aria: "Enter" },
  Escape: { apple: "Esc", other: "Esc", aria: "Escape" },
  Slash: { apple: "/", other: "/", aria: "/" },
  Space: { apple: "Space", other: "Space", aria: "Space" },
  Tab: { apple: "Tab", other: "Tab", aria: "Tab" },
  Backspace: { apple: "⌫", other: "Backspace", aria: "Backspace" },
  ArrowUp: { apple: "↑", other: "↑", aria: "ArrowUp" },
  ArrowDown: { apple: "↓", other: "↓", aria: "ArrowDown" },
  ArrowLeft: { apple: "←", other: "←", aria: "ArrowLeft" },
  ArrowRight: { apple: "→", other: "→", aria: "ArrowRight" },
  Home: { apple: "Home", other: "Home", aria: "Home" },
  End: { apple: "End", other: "End", aria: "End" },
}

function keyName(code: string, kind: "apple" | "other" | "aria"): string {
  const named = KEY_NAMES[code]
  if (named) return named[kind]
  const letter = /^(?:Key|Digit)(.)$/.exec(code)
  return letter ? letter[1] : code
}

/**
 * The shortcut as people read it: "⌘K", "⌘↩", "⇧⌘K" on Apple platforms (Apple's modifier order, no spaces), "Ctrl K",
 * "Ctrl Enter", "Ctrl Shift K" elsewhere. A printable key with its character (`?`, `/`) is shown as that character.
 */
export function formatShortcut(spec: ShortcutSpec, platform: Platform): string {
  if (spec.key !== undefined && !spec.mod && !spec.alt) return spec.key
  const code = codesOf(spec)[0]
  if (platform === "apple") return `${spec.alt ? "⌥" : ""}${spec.shift ? "⇧" : ""}${spec.mod ? "⌘" : ""}${keyName(code, "apple")}`
  return [spec.mod && "Ctrl", spec.alt && "Alt", spec.shift && "Shift", keyName(code, "other")].filter(Boolean).join(" ")
}

/** The `aria-keyshortcuts` value for a control the shortcut belongs to: "Meta+K", "Control+K", "?". */
export function ariaKeyShortcuts(spec: ShortcutSpec, platform: Platform): string {
  if (spec.key !== undefined && !spec.mod && !spec.alt) return spec.key
  const code = codesOf(spec)[0]
  return [spec.mod && (platform === "apple" ? "Meta" : "Control"), spec.alt && "Alt", spec.shift && "Shift", keyName(code, "aria")]
    .filter(Boolean)
    .join("+")
}
