/**
 * Unit specs for the off-canvas navigation state (US-176): open, close, Escape, the viewport growing wide, and when focus
 * returns to the menu button.
 */
import { describe, expect, it } from "vitest";

import { INITIAL_NAV_STATE, navReducer, restoresFocus, type NavAction, type NavState } from "./app-shell-state";

const open: NavState = { open: true };
const closed: NavState = { open: false };

describe("navReducer", () => {
  it("starts closed", () => {
    expect(INITIAL_NAV_STATE).toEqual(closed);
  });

  it("toggle opens a closed drawer and closes an open one", () => {
    expect(navReducer(closed, { type: "toggle" })).toEqual(open);
    expect(navReducer(open, { type: "toggle" })).toEqual(closed);
  });

  it("open and close are idempotent and return the same state when nothing changes", () => {
    expect(navReducer(open, { type: "open" })).toBe(open);
    expect(navReducer(closed, { type: "close" })).toBe(closed);
    expect(navReducer(open, { type: "close" })).toEqual(closed);
  });

  it("Escape closes an open drawer; any other key, and Escape while closed, change nothing", () => {
    expect(navReducer(open, { type: "key", key: "Escape" })).toEqual(closed);
    expect(navReducer(open, { type: "key", key: "Enter" })).toBe(open);
    expect(navReducer(open, { type: "key", key: "Tab" })).toBe(open);
    expect(navReducer(closed, { type: "key", key: "Escape" })).toBe(closed);
  });

  it("a viewport that grows to bp-lg closes the drawer, so the page behind is never left inert; a narrow one leaves it", () => {
    expect(navReducer(open, { type: "viewport", wide: true })).toEqual(closed);
    expect(navReducer(open, { type: "viewport", wide: false })).toBe(open);
    expect(navReducer(closed, { type: "viewport", wide: true })).toBe(closed);
  });

  it("following a link in the drawer closes it", () => {
    expect(navReducer(open, { type: "navigated" })).toEqual(closed);
  });
});

describe("restoresFocus", () => {
  it("gives focus back to the menu button on the viewer's own close, not on a route change or a resize", () => {
    const cases: Array<[NavAction, boolean]> = [
      [{ type: "close" }, true],
      [{ type: "key", key: "Escape" }, true],
      [{ type: "toggle" }, true],
      [{ type: "navigated" }, false],
      [{ type: "viewport", wide: true }, false],
      [{ type: "open" }, false],
    ];
    for (const [action, expected] of cases) expect(restoresFocus(action), action.type).toBe(expected);
  });
});

describe("inertOutsideIds", () => {
  it("makes the given outside elements (the skip link) inert while open, and none when closed", async () => {
    const { inertOutsideIds } = await import("./app-shell-state");
    expect(inertOutsideIds(true, ["skip-link"])).toEqual(["skip-link"]);
    expect(inertOutsideIds(false, ["skip-link"])).toEqual([]);
  });
});
