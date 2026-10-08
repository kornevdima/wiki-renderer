/**
 * Unit specs for where Tab goes when the user menu closes on it (US-176, WAI-ARIA menu button).
 */
import { describe, expect, it } from "vitest";

import { pickTabTarget } from "./tab-target";

describe("pickTabTarget", () => {
  const order = ["skip", "brand", "trigger", "next", "last"];

  it("Tab goes to the element after the trigger, Shift+Tab to the one before", () => {
    expect(pickTabTarget(order, "trigger", false)).toBe("next");
    expect(pickTabTarget(order, "trigger", true)).toBe("brand");
  });

  it("is null at either end, or when the trigger isn't in the list", () => {
    expect(pickTabTarget(["trigger"], "trigger", false)).toBeNull();
    expect(pickTabTarget(["trigger", "x"], "trigger", true)).toBeNull();
    expect(pickTabTarget(order, "missing", false)).toBeNull();
  });
});
