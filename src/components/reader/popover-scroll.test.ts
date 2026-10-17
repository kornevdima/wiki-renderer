import { describe, expect, it } from "vitest";

import { revealScrollTop } from "./popover-scroll";

const base = { listTop: 100, listHeight: 300, itemHeight: 40, scrollTop: 0, scrollHeight: 1000 };

describe("revealScrollTop (US-282)", () => {
  it("leaves the offset alone when the entry is already fully inside the list", () => {
    expect(revealScrollTop({ ...base, itemTop: 150, scrollTop: 20 })).toBe(20);
    expect(revealScrollTop({ ...base, itemTop: 360 })).toBe(0);
  });
  it("centres an entry below the visible part", () => {
    expect(revealScrollTop({ ...base, itemTop: 700 })).toBe(600 - 130);
  });
  it("clamps at the top and at the end of the scrollable range", () => {
    expect(revealScrollTop({ ...base, itemTop: 60, scrollTop: 10 })).toBe(0);
    expect(revealScrollTop({ ...base, itemTop: 1000 })).toBe(700);
  });
  it("treats an entry cut off at the bottom as outside", () => {
    expect(revealScrollTop({ ...base, itemTop: 380 })).toBe(280 - 130);
  });
});
