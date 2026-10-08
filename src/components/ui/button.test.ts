import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

// US-174 (NFR-013, FR-049, TC-499): every button variant resolves to its token classes. The computed values at rest, hover,
// pressed and disabled are the e2e's; this pins the class strings so a variant cannot drift off its tokens.
const VARIANTS = ["default", "solid", "brand", "danger", "outline", "secondary", "ghost", "link"] as const;
const FILLED = ["solid", "brand", "danger"] as const;

/** Findings for a class string: no `transition-all`, no bare `transition`, no outline property in a transition (BUG-028). */
function transitionFindings(cls: string): string[] {
  const out: string[] = [];
  if (/transition-all/.test(cls)) out.push("transition-all");
  if (/transition-\[[^\]]*outline/.test(cls)) out.push("outline in a transition");
  if (/(?:^|\s)transition(?:\s|$)/.test(cls)) out.push("bare transition");
  return out;
}

describe("US-174: buttonVariants", () => {
  it("M2: a class string that carries transition-all is caught", () => {
    expect(transitionFindings(`${buttonVariants({ variant: "danger" })} transition-all`)).toContain("transition-all");
    expect(transitionFindings(`${buttonVariants({ variant: "solid" })} transition-[outline-color,box-shadow]`)).toContain("outline in a transition");
  });

  it.each(VARIANTS)("%s: no transition-all and no outline property in a transition (BUG-028)", (variant) => {
    const cls = buttonVariants({ variant });
    expect(transitionFindings(cls)).toEqual([]);
    expect(cls).toContain("transition-[background-color,background-image,box-shadow,border-color]");
    expect(cls).toContain("duration-(--duration-button)");
    expect(cls).toContain("ease-standard");
    expect(cls).toContain("motion-reduce:transition-none");
  });

  it.each(VARIANTS)("%s: disabled is opacity-disabled, not-allowed and unshadowed", (variant) => {
    const cls = buttonVariants({ variant });
    expect(cls).toContain("disabled:opacity-(--opacity-disabled)");
    expect(cls).toContain("disabled:cursor-not-allowed");
    expect(cls).toContain("disabled:shadow-none");
    expect(cls).not.toContain("disabled:pointer-events-none");
  });

  it("solid and default: primary fill, on-primary label, shade-hover and shade-active over the fill", () => {
    for (const variant of ["default", "solid"] as const) {
      const cls = buttonVariants({ variant });
      expect(cls).toContain("bg-primary");
      expect(cls).toContain("text-primary-foreground");
      expect(cls).toContain("not-disabled:hover:bg-(image:--shade-hover-fill)");
      expect(cls).toContain("not-disabled:active:bg-(image:--shade-active-fill)");
      expect(cls).not.toContain("--gradient-brand");
    }
  });

  it("US-209: the brand label is text-label-large (18.67px bold, large text); the other variants and sizes keep their size", () => {
    const brand = cn(buttonVariants({ variant: "brand", size: "lg" })); // as Button renders it: merged
    expect(brand).toContain("font-bold");
    expect(brand).toContain("text-label-large");
    expect(brand).not.toContain("text-base");
    expect(brand).toContain("h-(--control-h-l)");
    for (const variant of VARIANTS.filter((v) => v !== "brand")) {
      expect(buttonVariants({ variant, size: "lg" })).toContain("text-base");
      expect(buttonVariants({ variant, size: "lg" })).not.toContain("text-label-large");
      expect(buttonVariants({ variant })).toContain("text-sm");
      expect(buttonVariants({ variant })).not.toContain("text-label-large");
    }
    expect(buttonVariants({ variant: "brand" })).not.toContain("text-label-large");
  });

  it("brand: the gradient over primary, with the shades layered above the gradient", () => {
    const cls = buttonVariants({ variant: "brand" });
    expect(cls).toContain("bg-primary");
    expect(cls).toContain("bg-(image:--gradient-brand)");
    expect(cls).toContain("not-disabled:hover:bg-(image:--brand-hover-fill)");
    expect(cls).toContain("not-disabled:active:bg-(image:--brand-active-fill)");
  });

  it("danger: danger-fill with an on-danger label, never the status text colour or a tint", () => {
    const cls = buttonVariants({ variant: "danger" });
    expect(cls).toContain("bg-danger-fill");
    expect(cls).toContain("text-on-danger");
    expect(cls).not.toMatch(/bg-danger(?:\s|$|\/)/);
    expect(cls).not.toMatch(/bg-destructive/);
    expect(cls).toContain("not-disabled:hover:bg-(image:--shade-hover-fill)");
    expect(cls).toContain("not-disabled:active:bg-(image:--shade-active-fill)");
  });

  it.each(FILLED)("%s: lifts with shadow-button, -hover and -active (the tokens)", (variant) => {
    const cls = buttonVariants({ variant });
    expect(cls).toContain("shadow-(--shadow-button)");
    expect(cls).toContain("not-disabled:hover:shadow-(--shadow-button-hover)");
    expect(cls).toContain("not-disabled:active:shadow-(--shadow-button-active)");
  });

  it.each(FILLED)("%s sm: flat at rest, shadow-button only on hover, shadow-button-active pressed (the mockup's .esg-btn--sm)", (variant) => {
    const cls = buttonVariants({ variant, size: "sm" });
    expect(cls).toContain("shadow-none");
    expect(cls).toContain("not-disabled:hover:shadow-(--shadow-button)");
    expect(cls).not.toContain("shadow-(--shadow-button-hover)");
    expect(cls).not.toMatch(/(?:^|\s)shadow-\(--shadow-button\)/);
    expect(cls).toContain("not-disabled:active:shadow-(--shadow-button-active)");
  });

  it("outline: a border-strong edge, transparent fill, hover-overlay and border-hover; no shadow", () => {
    const cls = buttonVariants({ variant: "outline" });
    expect(cls).toContain("border-border-strong");
    expect(cls).toContain("bg-transparent");
    expect(cls).toContain("not-disabled:hover:bg-hover-overlay");
    expect(cls).toContain("hover:border-foreground");
    expect(cls).not.toMatch(/--shadow-button/);
  });

  it.each(["default", ...FILLED] as const)("%s: no border at all (BUG-036), so no ring shows between the fill and the shadow", (variant) => {
    const tokens = buttonVariants({ variant }).split(/\s+/);
    // Any border utility under any variant prefix (hover:, not-disabled:hover:, ...); aria-invalid:border-danger is inert on a filled button and pinned elsewhere.
    expect(tokens.filter((t) => !t.startsWith("aria-invalid:") && /^(?:\S*:)?!?border(?:-|$)/.test(t))).toEqual([]);
    expect(tokens).not.toContain("bg-clip-padding");
  });

  it.each(["outline", "secondary", "ghost", "link"] as const)("%s: keeps its 1px border (the edge is its look)", (variant) => {
    expect(buttonVariants({ variant }).split(/\s+/)).toContain("border");
  });

  it("ghost: bare, hover-overlay only", () => {
    const cls = buttonVariants({ variant: "ghost" });
    expect(cls).toContain("not-disabled:hover:bg-hover-overlay");
    expect(cls).not.toMatch(/(?:^|\s)bg-(?:primary|danger-fill|transparent)/);
  });

  it("the old tinted destructive variant is gone", () => {
    expect(readFileSync(join(__dirname, "button.tsx"), "utf8")).not.toMatch(/destructive/);
  });

  it("sizes come from the control-height and padding tokens", () => {
    expect(buttonVariants({ size: "default" })).toContain("h-(--control-h-s)");
    expect(buttonVariants({ size: "default" })).toContain("px-(--pad-button-s-x)");
    expect(buttonVariants({ size: "sm" })).toContain("h-(--control-h-m)");
    expect(buttonVariants({ size: "lg" })).toContain("h-(--control-h-l)");
    expect(buttonVariants({ size: "lg" })).toContain("px-(--pad-button-x)");
  });

  it("the base uses the radius-md token (rounded-lg) and carries no focus ring or halo", () => {
    expect(buttonVariants()).toContain("rounded-lg");
    expect(buttonVariants()).not.toMatch(/ring-\d|ring-destructive/);
  });
});
