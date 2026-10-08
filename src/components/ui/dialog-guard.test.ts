import { describe, expect, it } from "vitest"

import { dialogRoleProps, outsideInteractionDecision } from "./dialog-guard"

// US-175 (FR-049), contract M1: once the viewer has typed in a form dialog, an outside click must not close it.
describe("US-175: outsideInteractionDecision", () => {
  it("M1: a dirty form is told to prevent the outside close", () => {
    expect(outsideInteractionDecision({ dirty: true })).toBe("prevent")
  })

  it("a clean dialog still closes on an outside click", () => {
    expect(outsideInteractionDecision({ dirty: false })).toBe("allow")
  })

  it("M1: a fixture that flips the rule is caught", () => {
    const flipped = (state: { dirty: boolean }): "prevent" | "allow" => (state.dirty ? "allow" : "prevent")
    expect(flipped({ dirty: true })).not.toBe(outsideInteractionDecision({ dirty: true }))
  })
})

describe("US-175: dialogRoleProps", () => {
  it("the confirm variant is an alertdialog", () => {
    expect(dialogRoleProps("confirm")).toEqual({ role: "alertdialog" })
  })

  it("the default variant (the connect and search dialogs) carries no role key, so Radix's role=dialog stands", () => {
    const props = dialogRoleProps("default")
    expect("role" in props).toBe(false)
    expect({ role: "dialog", ...props }.role).toBe("dialog")
  })
})
