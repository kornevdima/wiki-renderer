import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StatusBadge, type StatusBadgeVariant } from "./status-badge"

// US-202 (NFR-013, FR-003 via CR-006): the StatusBadge's markup. Computed colours and contrast are the e2e's and TC-499's.
const render = (variant: StatusBadgeVariant | undefined, word: string): string =>
  renderToStaticMarkup(createElement(StatusBadge, variant ? { variant } : {}, word))

/** What is wrong with a rendered badge: it must hold one decorative icon and a non-empty word, and no colour literal. */
function badgeProblems(html: string): string[] {
  const problems: string[] = []
  const icons = html.match(/<svg\b[^>]*>/g) ?? []
  if (icons.length !== 1 || !/aria-hidden="true"/.test(icons[0] ?? "")) problems.push("needs exactly one aria-hidden svg icon")
  const word = html.replace(/<svg\b[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, "").trim()
  if (word === "") problems.push("needs a word")
  if (/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/i.test(html.replace(/<svg\b[\s\S]*?<\/svg>/g, ""))) problems.push("has a colour literal")
  return problems
}

const WORDS: Record<StatusBadgeVariant, string> = { neutral: "Pending", success: "Active", warning: "Expiring", danger: "Revoked" }

describe("US-202: StatusBadge", () => {
  it.each(Object.entries(WORDS) as [StatusBadgeVariant, string][])("%s: a decorative icon, the word, the status tokens and nowrap", (variant, word) => {
    const html = render(variant, word)
    expect(badgeProblems(html)).toEqual([])
    expect(html).toContain(`>${word}</span>`)
    expect(html).toContain(`data-variant="${variant}"`)
    const token = variant === "neutral" ? "info" : variant
    expect(html).toContain(`border-${token}-border`)
    expect(html).toContain(`bg-${token}-surface`)
    expect(html).toContain(`text-${token}`)
    expect(html).toContain("whitespace-nowrap")
    expect(html).toContain("border-")
    expect(html).toContain("rounded-(--ds-radius-sm)")
    expect(html).toContain("px-(--pad-tag-x)")
    expect(html).toContain("py-(--pad-tag-y)")
    expect(html).toContain("size-(--icon-status)")
  })

  it("the word is the mockup's .label (12px, 16px leading, 400) through real utilities, not a dead `label` class", () => {
    for (const variant of Object.keys(WORDS) as StatusBadgeVariant[]) {
      const tokens = (render(variant, "x").match(/<span[^>]*class="([^"]*)"/)?.[1] ?? "").split(/\s+/)
      expect(tokens).toEqual(expect.arrayContaining(["text-xs", "leading-4", "font-normal"]))
      expect(tokens).not.toContain("label")
    }
  })

  it("the wrapper carries data-slot=status-badge (the e2e clone reads it)", () => {
    for (const variant of Object.keys(WORDS) as StatusBadgeVariant[]) expect(render(variant, "x")).toContain('data-slot="status-badge"')
  })

  it("no variant is the neutral badge (the info tokens)", () => {
    const html = render(undefined, "Pending")
    expect(html).toContain('data-variant="neutral"')
    expect(html).toContain("bg-info-surface")
  })

  it("the four variants use four different icons", () => {
    const icons = (Object.keys(WORDS) as StatusBadgeVariant[]).map((v) => render(v, "x").match(/<svg[\s\S]*?<\/svg>/)?.[0])
    expect(new Set(icons).size).toBe(4)
  })

  it("M1: a fixture badge with no word, or no icon, or a visible icon, is caught", () => {
    expect(badgeProblems('<span class="x"><svg aria-hidden="true"></svg></span>')).toContain("needs a word")
    expect(badgeProblems('<span class="x">Active</span>')).toContain("needs exactly one aria-hidden svg icon")
    expect(badgeProblems('<span class="x"><svg></svg>Active</span>')).toContain("needs exactly one aria-hidden svg icon")
    expect(badgeProblems('<span class="x bg-[#fff]"><svg aria-hidden="true"></svg>Active</span>')).toContain("has a colour literal")
  })
})
