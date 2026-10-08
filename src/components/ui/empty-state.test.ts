import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EmptyState } from "./empty-state"

// US-175 (FR-049, NFR-013): the EmptyState in both sizes, with its optional parts.
const icon = createElement("svg", { "data-testid": "icon" })
const render = (props: Record<string, unknown>): string => renderToStaticMarkup(createElement(EmptyState, { icon, title: "No tenants yet.", ...props }))

describe("US-175: EmptyState", () => {
  it("compact: the 40px icon disc, the tight padding, a paragraph title and no text or actions by default", () => {
    const html = render({ size: "compact", titleTestId: "tenant-table-empty" })
    expect(html).toContain('data-size="compact"')
    expect(html).toContain("size-(--control-h-m)")
    expect(html).toContain("py-8")
    expect(html).toMatch(/<p data-slot="empty-state-title" data-testid="tenant-table-empty"[^>]*>No tenants yet\.<\/p>/)
    expect(html).not.toContain("empty-state-text")
    expect(html).not.toContain("empty-state-actions")
  })

  it("full: the 56px icon disc and the roomy padding, and the default size", () => {
    for (const html of [render({ size: "full" }), render({})]) {
      expect(html).toContain('data-size="full"')
      expect(html).toContain("size-(--icon-feature)")
      expect(html).toContain("py-12")
    }
  })

  it("the icon is decorative and comes before the title", () => {
    const html = render({ size: "compact" })
    expect(html).toContain('data-slot="empty-state-icon" aria-hidden="true"')
    expect(html.indexOf("empty-state-icon")).toBeLessThan(html.indexOf("empty-state-title"))
  })

  it("shows the optional text and actions, in that order after the title", () => {
    const html = render({ size: "full", titleAs: "h2", text: "Ask your administrator for a new link.", actions: createElement("a", { href: "/" }, "Back") })
    expect(html).toContain("<h2")
    const order = ["empty-state-title", "empty-state-text", "empty-state-actions"].map((slot) => html.indexOf(slot))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every((i) => i > -1)).toBe(true)
    expect(html).toContain("Ask your administrator for a new link.")
  })

  it("US-212 R7: a compact title is 16px bold, the full size and any h1 stay 20px", () => {
    const compact = render({ size: "compact" })
    expect(compact).toMatch(/<p data-slot="empty-state-title"[^>]*class="text-base leading-6 font-bold/)
    expect(compact).not.toContain("text-xl")
    expect(render({ size: "compact", titleAs: "h1" })).toMatch(/<h1 data-slot="empty-state-title"[^>]*class="text-xl leading-6 font-bold/)
    expect(render({ size: "full" })).toMatch(/<p data-slot="empty-state-title"[^>]*class="text-xl leading-6 font-bold/)
  })
})
