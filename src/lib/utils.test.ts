// The type-scale list cn() merges by must equal the font sizes the installed theme defines, and cn() must treat those utilities as font sizes.
// Ported from the registry's utils.test.ts (US-216, ADR-020); the registry read tokens.json, this repo reads the installed esg-theme.css.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TYPE_SCALE, cn } from "./utils";

const themeCss = readFileSync(fileURLToPath(new URL("../app/esg-theme.css", import.meta.url)), "utf8");

/** Every `--text-<name>` font-size variable, in file order, without the `--line-height` and `--font-weight` sub-properties. */
const themeSizes = [...themeCss.matchAll(/^\s*--text-([a-z0-9-]+)\s*:/gm)].map((m) => m[1]!).filter((n) => !n.endsWith("--line-height") && !n.endsWith("--font-weight"));

describe("cn and the ESG type scale", () => {
  it("lists exactly the font sizes the installed esg-theme.css defines", () => {
    expect(themeSizes.length).toBeGreaterThan(0);
    expect([...TYPE_SCALE].sort()).toEqual([...new Set(themeSizes)].sort());
  });

  it("lets a type-scale size replace a stock size, and keeps colours", () => {
    expect(cn("text-base", "text-label-large")).toBe("text-label-large");
    expect(cn("text-sm", "text-title")).toBe("text-title");
    expect(cn("text-sm text-foreground", "text-title")).toBe("text-foreground text-title");
    expect(cn("text-label-large", "text-primary-foreground")).toBe("text-label-large text-primary-foreground");
  });

  it("keeps the brand button's text-label-large through a merge", async () => {
    const { buttonVariants } = await import("@/components/ui/button");
    const cls = buttonVariants({ variant: "brand", size: "lg" });
    expect(cls.split(/\s+/)).toContain("text-label-large");
    expect(cn(cls, "text-sm").split(/\s+/)).toContain("text-sm");
    expect(cn(cls, "text-sm").split(/\s+/)).not.toContain("text-label-large");
  });
});
