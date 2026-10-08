import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SKELETON_BAR_CLASS } from "./skeleton"
import { TablePersonCell, TableSkeletonRow } from "./table"
import { avatarTone, AVATAR_TONES, personInitials, personLabel } from "./table-person"

// US-181 (NFR-013, FR-049; the Gherkin "Person cell and loading rows"): the table's person cell and skeleton row.
describe("personInitials", () => {
  it("two words give two letters, upper-cased", () => {
    expect(personInitials("Robin Hale")).toBe("RH")
    expect(personInitials("robin hale")).toBe("RH")
  })

  it("one word gives one letter", () => {
    expect(personInitials("Robin")).toBe("R")
  })

  it("more than two words keep the first two", () => {
    expect(personInitials("Mary Jane Watson")).toBe("MJ")
  })

  it("an empty or blank name falls back to the email's first letter", () => {
    expect(personInitials("", "alex@example.com")).toBe("A")
    expect(personInitials("   ", "alex@example.com")).toBe("A")
  })

  it("nothing at all gives no initials, and never throws", () => {
    expect(personInitials("")).toBe("")
    expect(personInitials("", "")).toBe("")
  })

  it("collapses extra spaces between words and handles a letter outside the basic plane", () => {
    expect(personInitials("  Robin    Hale ")).toBe("RH")
    expect(personInitials("Émile Zola")).toBe("ÉZ")
  })
})

describe("personLabel and avatarTone", () => {
  it("the label is the name, or the email when the name is blank", () => {
    expect(personLabel("Robin Hale", "robin@example.com")).toBe("Robin Hale")
    expect(personLabel("", "robin@example.com")).toBe("robin@example.com")
  })

  it("a person keeps one tone, and the tone is one of the four pastel grounds", () => {
    expect(avatarTone("Robin Hale")).toBe(avatarTone("Robin Hale"))
    for (const seed of ["a", "Robin Hale", "robin@example.com", ""]) expect(AVATAR_TONES).toContain(avatarTone(seed))
  })
})

describe("TablePersonCell", () => {
  const render = (props: { name: string; email?: string; caption?: string }): string =>
    renderToStaticMarkup(createElement(TablePersonCell, props))

  it("US-184: a caption sits under the name; without one there is no caption element", () => {
    const withCaption = render({ name: "Robin Hale", email: "robin@example.com", caption: "Client A" })
    expect(withCaption).toMatch(/<span data-slot="table-person-name"[^>]*>Robin Hale<\/span><span data-slot="table-person-caption"[^>]*>Client A<\/span>/)
    expect(render({ name: "Robin Hale" })).not.toContain("table-person-caption")
  })

  it("the avatar is aria-hidden and carries the initials; the name is plain readable text", () => {
    const html = render({ name: "Robin Hale", email: "robin@example.com" })
    expect(html).toMatch(/<span data-slot="table-person-avatar" aria-hidden="true"[^>]*>RH<\/span>/)
    expect(html).toMatch(/<span data-slot="table-person-name"[^>]*>Robin Hale<\/span>/)
    expect(html.indexOf("table-person-avatar")).toBeLessThan(html.indexOf("table-person-name"))
  })

  it("an empty name shows the email, and its initial", () => {
    const html = render({ name: "", email: "alex@example.com" })
    expect(html).toMatch(/aria-hidden="true"[^>]*>A<\/span>/)
    expect(html).toContain(">alex@example.com</span>")
  })

  it("the avatar ground is a token class, never a colour literal", () => {
    const html = render({ name: "Robin Hale" })
    expect(html).toMatch(/bg-pastel-(?:blue|green|pink|coral)/)
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
  })
})

describe("TableSkeletonRow", () => {
  const render = (props: { columns: number; numericColumns?: readonly number[] }): string =>
    renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement(TableSkeletonRow, props))))

  it("renders one cell with one skeleton bar per column", () => {
    for (const columns of [1, 3, 4]) {
      const html = render({ columns })
      expect(html.match(/<td\b/g)).toHaveLength(columns)
      expect(html.match(/data-slot="skeleton-bar"/g)).toHaveLength(columns)
    }
  })

  it("is decorative: the row and each bar are aria-hidden", () => {
    const html = render({ columns: 2 })
    expect(html).toMatch(/<tr data-slot="table-skeleton-row" aria-hidden="true"/)
    expect(html.match(/data-slot="skeleton-bar" aria-hidden="true"/g)).toHaveLength(2)
  })

  it("a number column's cell is right-aligned and its bar sits at the right edge", () => {
    const html = render({ columns: 3, numericColumns: [2] })
    const cells = html.match(/<td\b[^>]*>.*?<\/td>/g) ?? []
    expect(cells[2]).toContain("text-right")
    expect(cells[2]).toContain("ml-auto")
    expect(cells[0]).not.toContain("text-right")
  })

  it("the pulse runs under motion-safe only: no bare animate class anywhere", () => {
    expect(SKELETON_BAR_CLASS).toContain("motion-safe:animate-[esg-skeleton_1.4s_ease-in-out_infinite]")
    const unguarded = SKELETON_BAR_CLASS.split(/\s+/).filter((token) => /(?:^|:)animate-/.test(token) && !/^motion-safe:/.test(token))
    expect(unguarded).toEqual([])
    expect(render({ columns: 2 })).not.toMatch(/class="[^"]*(?:^|\s)animate-/)
  })

  it("the bar's ground is the `track` token", () => {
    expect(SKELETON_BAR_CLASS).toContain("bg-track")
  })
})
