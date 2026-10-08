import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Alert, alertRole } from "./alert"

// US-175 (FR-049, NFR-013): the Alert's roles and structure. Computed colours and contrast are the e2e's and TC-499's.
const render = (props: Record<string, unknown>, text = "Something went wrong. Please try again."): string =>
  renderToStaticMarkup(createElement(Alert, props, text))

describe("US-175: Alert", () => {
  it("danger is a live role=alert; info, success and warning are role=status", () => {
    expect(alertRole("danger")).toBe("alert")
    expect(alertRole("info")).toBe("status")
    expect(alertRole("warning")).toBe("status")
    expect(alertRole("success")).toBe("status")
    expect(render({ variant: "success" })).toContain('role="status"')
    expect(render({ variant: "danger" })).toContain('role="alert"')
    expect(render({ variant: "warning" })).toContain('role="status"')
    expect(render({ variant: "info" })).toContain('role="status"')
    expect(render({})).toContain('role="status"')
  })

  it("a role override wins over the variant's default; without one the defaults stay (US-177)", () => {
    expect(render({ variant: "warning", role: "alert" })).toContain('role="alert"')
    expect(render({ variant: "warning", role: "alert" })).not.toContain('role="status"')
    expect(render({ variant: "info", role: "alert" })).toContain('role="alert"')
    expect(render({ variant: "danger", role: "status" })).toContain('role="status"')
    expect(render({ variant: "danger" })).toContain('role="alert"')
    expect(render({ variant: "info" })).toContain('role="status"')
  })

  it.each(["info", "success", "warning", "danger"] as const)("%s: a decorative icon, the variant, the status tokens and the text", (variant) => {
    const html = render({ variant })
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(html).toContain(`data-variant="${variant}"`)
    expect(html).toContain(`border-${variant}-border`)
    expect(html).toContain(`bg-${variant}-surface`)
    expect(html).toContain(`text-${variant}`)
    expect(html).toContain("Something went wrong. Please try again.")
  })

  it("each variant has its own icon", () => {
    const icons = (["info", "success", "warning", "danger"] as const).map((v) => /lucide-([a-z-]+)/.exec(render({ variant: v }))?.[1])
    expect(new Set(icons).size).toBe(4)
  })

  it("passes the id and test id through to the live region", () => {
    const html = render({ variant: "danger", "data-testid": "wiki-picker-connect-message" })
    expect(html).toMatch(/<div role="alert"[^>]*data-testid="wiki-picker-connect-message"/)
  })

  it("puts the title above the text and the action area under the text, only when given", () => {
    const html = render({ variant: "warning", title: "Linked a disconnected wiki", actions: createElement("a", { href: "/admin/wikis" }, "Open wikis") })
    const title = html.indexOf('data-slot="alert-title"')
    const text = html.indexOf('data-slot="alert-text"')
    const actions = html.indexOf('data-slot="alert-actions"')
    expect(title).toBeGreaterThan(-1)
    expect(text).toBeGreaterThan(title)
    expect(actions).toBeGreaterThan(text)
    const plain = render({ variant: "info" })
    expect(plain).not.toContain("alert-title")
    expect(plain).not.toContain("alert-actions")
  })
})
