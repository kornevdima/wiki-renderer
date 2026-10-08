import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buttonVariants } from "./button";

// US-200 (NFR-013, NFR-009; US-170 review C1): the design system's focus ring is one outline (the installed esg-theme.css). The vendored
// shadcn halo (a focus-visible ring plus a focus-visible border colour) is gone from Button and Input. US-174 restyled the aria-invalid classes: a danger border only,
// with no ring.
const VARIANTS = ["default", "solid", "brand", "danger", "outline", "secondary", "ghost", "link"] as const;
// One pattern for both files: any focus, focus-visible or focus-within utility (behind any stacked variant, such as
// `dark:` or `hover:`) that sets a ring, border, shadow or outline. `outline-none` is not a halo, so it is excluded.
const HALO = /(?:^|[\s:])(?:focus|focus-visible|focus-within):(?:ring|border|shadow|outline(?!-none))/;
const read = (name: string): string => readFileSync(join(__dirname, name), "utf8");

describe("US-200: no shadcn focus halo on Button or Input", () => {
  it.each(VARIANTS)("row 1: the %s button carries no focus ring, shadow or border-colour class", (variant) => {
    expect(buttonVariants({ variant })).not.toMatch(HALO);
  });

  it("row 1: the input class string carries no focus ring, shadow or border-colour class", () => {
    expect(read("input.tsx")).not.toMatch(HALO);
  });

  it("row 3 (US-174): the aria-invalid state is a danger-token border on Button and Input, with no ring or halo", () => {
    const button = buttonVariants();
    const input = read("input.tsx");
    for (const [name, source] of [["button", button], ["input", input]] as const) {
      expect(source, `${name}: danger border`).toContain("aria-invalid:border-danger");
      expect(source, `${name}: no invalid ring`).not.toMatch(/aria-invalid:ring/);
      expect(source, `${name}: no destructive tint`).not.toMatch(/aria-invalid:[a-z-]*destructive/);
    }
  });
});
