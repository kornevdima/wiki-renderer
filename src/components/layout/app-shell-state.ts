export interface NavState {
  open: boolean;
}

export type NavAction =
  | { type: "toggle" }
  | { type: "open" }
  | { type: "close" }
  | { type: "key"; key: string }
  | { type: "viewport"; wide: boolean }
  | { type: "navigated" };

export const INITIAL_NAV_STATE: NavState = { open: false };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "toggle":
      return { open: !state.open };
    case "open":
      return state.open ? state : { open: true };
    case "close":
    case "navigated":
      return state.open ? { open: false } : state;
    case "key":
      return action.key === "Escape" && state.open ? { open: false } : state;
    case "viewport":
      return action.wide && state.open ? { open: false } : state;
  }
}

/**
 * Elements outside the shell that must be inert while the drawer is open, by id. The topbar and content are inert inside the
 * shell itself; the skip link lives in the root layout, so the shell reaches it by id. Empty when closed.
 */
export function inertOutsideIds(open: boolean, ids: readonly string[]): string[] {
  return open ? [...ids] : [];
}

/** Whether a close should give focus back to the menu button: a viewer's own close, not a route change or a resize. */
export function restoresFocus(action: NavAction): boolean {
  return action.type === "close" || action.type === "key" || action.type === "toggle";
}
