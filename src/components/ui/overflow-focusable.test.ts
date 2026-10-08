import { describe, expect, it } from "vitest"

import { isOverflowing } from "./overflow-focusable"

// US-175: the overflow-only tab stop's decision, for both axes.
const box = (over: Partial<Parameters<typeof isOverflowing>[0]>) => ({ scrollHeight: 100, clientHeight: 100, scrollWidth: 300, clientWidth: 300, ...over })

describe("US-175: isOverflowing", () => {
  it("is false when the content fits on the axis", () => {
    expect(isOverflowing(box({}), "x")).toBe(false)
    expect(isOverflowing(box({}), "y")).toBe(false)
  })

  it("x looks only at width and y only at height", () => {
    expect(isOverflowing(box({ scrollWidth: 301 }), "x")).toBe(true)
    expect(isOverflowing(box({ scrollWidth: 301 }), "y")).toBe(false)
    expect(isOverflowing(box({ scrollHeight: 101 }), "y")).toBe(true)
    expect(isOverflowing(box({ scrollHeight: 101 }), "x")).toBe(false)
  })
})
