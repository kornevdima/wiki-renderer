import { createElement } from "react"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { renderToStaticMarkup } from "react-dom/server"
import { Toast } from "radix-ui"
import { describe, expect, it } from "vitest"
import { createTranslator } from "next-intl"

import messages from "../../../messages/en.json"
import { BODY_CLASS, CLOSE_CLASS, CONTENT_CLASS, ICON_CLASS, TEXT_CLASS, TITLE_CLASS, TOAST_CLASS, VARIANT_ICON_CLASS, VIEWPORT_CLASS } from "./toast-classes"
import { ToastList, toastRole } from "./toast"

// US-202 (NFR-013): the toast's markup. Radix portals each toast into its viewport after mount, so a static render of the
// toaster holds the viewport and no toast (recorded below); the toast's roles, classes and parts are pinned through the
// variant map, the class strings and the source. Live toast behaviour is US-182's e2e.
const ALL = { CONTENT_CLASS, VIEWPORT_CLASS, TOAST_CLASS, ICON_CLASS, BODY_CLASS, TITLE_CLASS, TEXT_CLASS, CLOSE_CLASS, ...VARIANT_ICON_CLASS }
const MOTION = /(?:^|:)(?:animate-|zoom-|fade-|slide-|spin-|duration-|transition)/

/** Class tokens that move something without a `motion-safe:` (or `motion-reduce:`) guard in front. */
function unguardedMotion(cls: string): string[] {
  return cls.split(/\s+/).filter((token) => MOTION.test(token) && !/^motion-(?:safe|reduce):/.test(token))
}

const source = readFileSync(fileURLToPath(new URL("./toast.tsx", import.meta.url)), "utf8")
const render = (): string =>
  renderToStaticMarkup(
    createElement(Toast.Provider, {}, createElement(ToastList, { items: [{ id: "a", variant: "danger", title: "T" }], notificationsLabel: "Notifications", dismissLabel: "Dismiss", onDismiss() {} })),
  )

describe("US-202: the toast markup", () => {
  it("danger is role=alert; neutral, success and warning are role=status", () => {
    expect(toastRole("danger")).toBe("alert")
    for (const v of ["neutral", "success", "warning"] as const) expect(toastRole(v)).toBe("status")
    // BUG-031: the role is on an element inside the <li>, which stays a list item of the <ol>; aria-live="off" leaves the single
    // announcement to Radix's own announcer.
    expect(source).toContain("<div role={toastRole(item.variant)} aria-live=\"off\"")
    expect(source).toContain('<li role="listitem"')
    expect(source).not.toMatch(/<Toast\.Root[^>]*role=/)
    expect(source).toMatch(/<Toast\.Root\s+asChild/)
    expect(source).toContain('type={item.variant === "danger" ? "foreground" : "background"}')
  })

  it("the viewport is a region labelled Notifications, polite and click-through when empty; Radix holds no toast statically", () => {
    const html = render()
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Notifications"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('style="pointer-events:none"')
    expect(html).toContain("<ol ")
    expect(html).not.toContain("<li")
  })

  it("each toast has a decorative icon, a title, optional text and a Dismiss button with a decorative x icon", () => {
    expect(source).toContain('<Icon aria-hidden="true"')
    expect(source).toContain("<Toast.Title")
    expect(source).toMatch(/item\.text \? <Toast\.Description/)
    expect(source).toContain("<Toast.Close aria-label={dismissLabel}")
    expect(source).toContain('<XIcon aria-hidden="true"')
    expect(source).toContain("duration={Infinity}")
  })

  it("is the raised panel: surface-raised, hairline border, shadow-raised; the region is at z-toast and at most 400px", () => {
    expect(TOAST_CLASS).toContain("bg-surface-raised")
    expect(TOAST_CLASS).toMatch(/(?:^|\s)border(?:\s|$)/)
    expect(TOAST_CLASS).toContain("border-border")
    expect(TOAST_CLASS).toContain("shadow-(--shadow-raised)")
    expect(TOAST_CLASS).toContain("pointer-events-auto")
    expect(VIEWPORT_CLASS).toContain("z-(--z-toast)")
    expect(VIEWPORT_CLASS).toContain("min(400px,")
    expect(VIEWPORT_CLASS).toContain("pointer-events-none")
    expect(VIEWPORT_CLASS).not.toMatch(/z-\d/)
  })

  it("the type scale: title 16/24/700, text 14/20/400 through real utilities", () => {
    for (const token of ["text-base", "leading-6", "font-bold"]) expect(TITLE_CLASS.split(/\s+/)).toContain(token)
    for (const token of ["text-sm", "leading-5", "font-normal"]) expect(TEXT_CLASS.split(/\s+/)).toContain(token)
  })

  it("pauses on pointer and focus, memoises useToast, disposes on unmount, and localises Radix's announcer label", () => {
    expect(source).toContain("onPointerEnter={() => gate?.pointer(true)}")
    expect(source).toContain("onPointerLeave={() => gate?.pointer(false)}")
    expect(source).toContain("onFocus={() => gate?.focus(true)}")
    expect(source).toContain("event.currentTarget.contains(event.relatedTarget")
    expect(source).toContain("React.useMemo(() => ({ toast: queue.push, dismiss: queue.dismiss }), [queue])")
    expect(source).toContain("React.useEffect(() => () => queue.dispose(), [queue])")
    expect(source).toContain('<Toast.Provider label={t("notifications")}')
  })

  it("onBlur releases the focus hold only when focus leaves the toast (relatedTarget outside); a fixture without the check fails", () => {
    const handlerOf = (src: string): ((e: unknown) => void) => {
      const body = /onBlur=\{(\(event\) => \{[\s\S]*?\n\s*\})\}/.exec(src)?.[1]
      if (!body) throw new Error("onBlur handler not found in the source")
      return (e) => new Function("gate", "event", `return (${body.replace(/ as Node \| null/g, "")})(event)`)(gateSpy, e)
    }
    const calls: boolean[] = []
    const gateSpy = { focus: (inside: boolean) => void calls.push(inside) }
    const inner = {}
    const outer = {}
    const currentTarget = { contains: (n: unknown) => n === inner }
    const releasesOn = (src: string, relatedTarget: unknown): boolean => {
      calls.length = 0
      handlerOf(src)({ currentTarget, relatedTarget })
      return calls.length === 1 && calls[0] === false
    }
    expect(releasesOn(source, inner), "focus moving to the Dismiss button inside keeps the hold").toBe(false)
    expect(releasesOn(source, outer), "focus moving outside releases").toBe(true)
    expect(releasesOn(source, null), "focus leaving the page releases").toBe(true)
    const mutated = source.replace("if (!event.currentTarget.contains(event.relatedTarget as Node | null))", "if (true)")
    expect(mutated).not.toBe(source)
    expect(releasesOn(mutated, inner), "M-blur: with the check removed, moving inside releases (the assertion above fails)").toBe(true)
  })

  it("the status colour reaches the icon through the status tokens", () => {
    expect(VARIANT_ICON_CLASS).toEqual({ neutral: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" })
  })

  it("the two new strings are verbatim, and nothing else was added", () => {
    const t = createTranslator({ locale: "en", messages, namespace: "toast" })
    expect(t("notifications")).toBe("Notifications")
    expect(t("dismiss")).toBe("Dismiss")
    expect(Object.keys(messages.toast)).toEqual(["notifications", "dismiss"])
  })

  it("no colour literal in any toast class string", () => {
    for (const cls of Object.values(ALL)) expect(cls).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/i)
  })
})

describe("US-202: toast reduced motion", () => {
  it("M3: a class string with an unguarded animation or transition is caught", () => {
    expect(unguardedMotion(`${TOAST_CLASS} animate-in`)).toEqual(["animate-in"])
    expect(unguardedMotion(`${CLOSE_CLASS} transition-colors`)).toEqual(["transition-colors"])
    expect(unguardedMotion("motion-safe:animate-in")).toEqual([])
  })

  it.each(Object.entries(ALL))("%s: no animation or transition outside a motion-safe guard", (_name, cls) => {
    expect(unguardedMotion(cls)).toEqual([])
  })

  it("the entry animation and the Dismiss transition exist, and only under motion-safe", () => {
    expect(TOAST_CLASS).toContain("motion-safe:animate-[esg-toast-in_var(--duration-base)_var(--ease-standard)]")
    expect(CLOSE_CLASS).toContain("motion-safe:transition-colors")
    expect(CLOSE_CLASS).toContain("motion-safe:duration-(--duration-fast)")
  })

  it("the component source adds no motion class of its own", () => {
    expect(source).not.toMatch(/animate-|transition|duration-/)
  })
})
