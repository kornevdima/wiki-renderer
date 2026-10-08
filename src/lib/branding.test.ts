import { afterEach, describe, expect, it, vi } from "vitest";

async function load(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("WIKI_DIRS", "w=/tmp/w");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return (await import("./branding")).branding();
}

afterEach(() => vi.unstubAllEnvs());

describe("branding", () => {
  it("defaults to Wiki Renderer / Wikis with a WR TenantLogo on indigo and no logo", async () => {
    expect(await load({})).toEqual({ name: "Wiki Renderer", product: "Wikis", initials: "WR", tone: "indigo", logo: "", titleSuffix: "Wiki Renderer" });
  });

  it("a company brand: name, product, derived initials, a logo route and its own title suffix", async () => {
    expect(
      await load({ BRAND_NAME: "The Firm", BRAND_PRODUCT: "Project wiki", BRAND_LOGO: "~/logo.png", BRAND_TITLE: "ESG Wikis", BRAND_TONE: "deep" }),
    ).toEqual({ name: "The Firm", product: "Project wiki", initials: "TF", tone: "deep", logo: "/api/brand/logo", titleSuffix: "ESG Wikis" });
  });

  it("explicit initials win, and blank optional values count as unset", async () => {
    expect(await load({ BRAND_INITIALS: "es", BRAND_LOGO: " ", BRAND_TITLE: "" })).toMatchObject({ initials: "ES", logo: "", titleSuffix: "Wiki Renderer" });
  });

  it("refuses more than two initials and an unknown tone (the design system's TenantLogo rules)", async () => {
    await expect(load({ BRAND_INITIALS: "ESG" })).rejects.toThrow(/BRAND_INITIALS/);
    await expect(load({ BRAND_TONE: "brand" })).rejects.toThrow(/BRAND_TONE/);
  });
});
