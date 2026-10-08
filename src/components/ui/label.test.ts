import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Label } from "./label"

// US-212 (NFR-013): the admin form label is the design system's 14/20, weight 700, `ink` style.
describe("US-212: Label", () => {
  const html = renderToStaticMarkup(createElement(Label, { htmlFor: "x" }, "Name"))

  it("is 14px (small, 14/20), bold and the ink colour", () => {
    expect(html).toContain("text-sm")
    expect(html).toContain("leading-5")
    expect(html).toContain("font-bold")
    expect(html).toContain("text-foreground")
  })

  it("is no longer weight 500 or a muted grey", () => {
    expect(html).not.toContain("font-medium")
    expect(html).not.toContain("text-muted-foreground")
    expect(html).not.toContain("text-ink-muted")
  })
})
