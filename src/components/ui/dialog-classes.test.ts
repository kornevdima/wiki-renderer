import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { BODY_CLASS, CLOSE_CLASS, CONFIRM_ICON_CLASS, CONTENT_CLASS, CONTENT_LARGE_CLASS, FOOTER_CLASS, HEADER_CLASS, OVERLAY_CLASS } from "./dialog-classes"

// US-175 (NFR-013, FR-049): the dialog's class strings are pinned. No animation without a reduced-motion guard (row 8's
// computed-style check is the e2e's), and no colour literal (the US-173 guard also scans, this names the dialog).
const ALL = { OVERLAY_CLASS, CONTENT_CLASS, CONTENT_LARGE_CLASS, HEADER_CLASS, BODY_CLASS, FOOTER_CLASS, CLOSE_CLASS, CONFIRM_ICON_CLASS }
const MOTION = /(?:^|:)(?:animate-|zoom-|fade-|slide-|spin-|duration-|transition)/

/** Class tokens that move something without a `motion-safe:` (or `motion-reduce:`) guard in front. */
function unguardedMotion(cls: string): string[] {
  return cls.split(/\s+/).filter((token) => MOTION.test(token) && !/^motion-(?:safe|reduce):/.test(token))
}

/** Class tokens that carry a colour literal. */
function colourLiterals(cls: string): string[] {
  return cls.split(/\s+/).filter((token) => /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/i.test(token))
}

describe("US-175: the dialog class strings", () => {
  it("M2: a class string with an unguarded animation is caught", () => {
    expect(unguardedMotion(`${CONTENT_CLASS} data-open:animate-in`)).toEqual(["data-open:animate-in"])
    expect(unguardedMotion(`${OVERLAY_CLASS} duration-100`)).toEqual(["duration-100"])
  })

  it.each(Object.entries(ALL))("%s: no animation, zoom, fade or duration outside a motion-safe guard", (_name, cls) => {
    expect(unguardedMotion(cls)).toEqual([])
  })

  it("carries no animation, zoom, fade or duration class at all: the design has no modal motion", () => {
    for (const cls of Object.values(ALL)) expect(cls).not.toMatch(/animate-|zoom-|fade-|slide-|duration-|transition|data-(?:open|closed):/)
  })

  it.each(Object.entries(ALL))("%s: no colour literal", (_name, cls) => {
    expect(colourLiterals(cls)).toEqual([])
    expect(colourLiterals(`${cls} bg-[#fff]`)).toEqual(["bg-[#fff]"])
  })

  it("is the Modal: scrim overlay, raised surface and shadow, hairline, muted footer, 560px and 800px widths", () => {
    expect(OVERLAY_CLASS).toContain("bg-scrim")
    expect(CONTENT_CLASS).toContain("bg-popover")
    expect(CONTENT_CLASS).toContain("shadow-(--shadow-raised)")
    expect(CONTENT_CLASS).toMatch(/(?:^|\s)border(?:\s|$)/)
    expect(CONTENT_CLASS).toContain("sm:max-w-(--modal-w)")
    expect(CONTENT_LARGE_CLASS).toBe("sm:max-w-(--modal-w-l)")
    expect(FOOTER_CLASS).toContain("bg-muted")
    expect(FOOTER_CLASS).toContain("border-t")
  })

  it("keeps no overflow clip on the content, so a focus outline at the body or footer edge is not cut", () => {
    expect(CONTENT_CLASS).not.toMatch(/overflow-/)
  })
})

describe("US-175: the Dialog source", () => {
  const source = readFileSync(fileURLToPath(new URL("./dialog.tsx", import.meta.url)), "utf8")

  it("the confirm variant is role=alertdialog with a header icon and no Close button", () => {
    expect(source).toContain("{...dialogRoleProps(variant)}")
    expect(source).not.toMatch(/role=\{[^}]*undefined/)
    expect(source).toContain("CONFIRM_ICON_CLASS")
    expect(source).toContain('showCloseButton ?? variant !== "confirm"')
  })

  it("routes outside interaction through the pure guard and keeps no animation or colour class of its own", () => {
    expect(source).toContain("outsideInteractionDecision({ dirty })")
    expect(source).not.toMatch(/transition-all|focus-visible:ring|focus-visible:border/)
  })
})
