/**
 * Pure view-model for the search dialog (US-091; D3, D4; TC-228, TC-476). No React: the panel renders whatever
 * `searchViewState` names, so each state and its precedence is unit-tested here.
 *
 * Precedence: a failed load shows the failure copy whatever was typed; a load in flight shows the loading copy; an
 * empty or whitespace-only query shows the idle copy (never "No matching pages."); otherwise rows or the empty copy.
 */
export type SearchPhase = "loading" | "ready" | "failed";
export type SearchViewState = "failed" | "loading" | "idle" | "empty" | "results";

export function searchViewState(input: { phase: SearchPhase; query: string; rowCount: number }): SearchViewState {
  if (input.phase === "failed") return "failed";
  if (input.phase === "loading") return "loading";
  if (input.query.trim() === "") return "idle";
  return input.rowCount === 0 ? "empty" : "results";
}

/** "1 result" for one, otherwise `other` with `{count}` replaced. The strings come from `messages/en.json`. */
export function formatResultCount(copy: { one: string; other: string }, count: number): string {
  return count === 1 ? copy.one : copy.other.replace("{count}", String(count));
}

/** True when a click should be left to the browser (new tab, new window, download, non-primary button). */
export function isModifiedClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * The shape of a keydown the search shortcut reads (US-222, SA-MOD Reader UI and print E3-D10, TC-516). Structural, so it is
 * unit-tested without a DOM.
 */
export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** True when another handler already took the key. */
  defaultPrevented?: boolean;
}

/** The selector for an open Radix menu or select list. Measured: Radix menu and select do not preventDefault Ctrl+K, so the DOM is the signal. */
export const OPEN_POPUP_SELECTOR = '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

/**
 * Ctrl+K or Cmd+K, and only that: Alt or Shift added, or another key, is not the shortcut. Either modifier opens search on any
 * platform (a Mac keyboard has Control too); the hint shows the platform's own. `key` is compared case-insensitively because
 * Caps Lock reports "K".
 */
export function isSearchShortcut(event: ShortcutKeyEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}

/**
 * Whether the shortcut should act now: not while the dialog is open (the key then belongs to the input and the browser) and not
 * while the mobile drawer is open (the page behind it is inert), not while a menu or select is open (`popupOpen`), and not when
 * another handler already prevented the key.
 */
export function shouldOpenOnShortcut(event: ShortcutKeyEvent, state: { dialogOpen: boolean; drawerOpen: boolean; popupOpen?: boolean }): boolean {
  return !state.dialogOpen && !state.drawerOpen && !state.popupOpen && event.defaultPrevented !== true && isSearchShortcut(event);
}

/** True for an Apple platform string (`navigator.userAgentData.platform`, `navigator.platform` or the user agent). */
export function isApplePlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Splits the "No pages match “{query}”" title around its `{query}` slot, so the query is rendered as React text and never goes
 * through a string replacement (`$&` in a query would be a replacement pattern) or an ICU formatter.
 */
export function splitEmptyTitle(template: string): { before: string; after: string } {
  const at = template.indexOf("{query}");
  return at < 0 ? { before: template, after: "" } : { before: template.slice(0, at), after: template.slice(at + "{query}".length) };
}
