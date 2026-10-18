// US-289 the default mark is WR on the ESG background: verification contract rows R1 and R2 (wiki/contracts/US-289-wr-mark-contract.md).
// Runs on the main project's server (BRAND_* unset), and against any E2E_BASE_URL (prod build, unpacked archive). R3 (branding
// that still wins) is brand-initials.spec.ts on the config project. Nothing here writes anywhere.
import { expect, test, type Page } from "@playwright/test";

const MARK = "/wr-mark.svg";
const LOGO = '[data-slot="tenant-logo-image"]';
const READER = "/w/sample/index.md";
const PAGES = [
  { name: "home", path: "/" },
  { name: "reader", path: READER },
  { name: "settings", path: "/settings" },
];

/** The visible brand logos on the page, as their src attributes. At a width where the sidebar is a drawer, the caller opens it first. */
async function visibleLogoSources(page: Page): Promise<string[]> {
  return page.locator(LOGO).evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden").map((el) => el.getAttribute("src") ?? ""),
  );
}

test.describe("US-289 default mark", () => {
  for (const size of [
    { name: "1440", width: 1440, height: 900 },
    { name: "375", width: 375, height: 667 },
  ]) {
    test.describe(`at ${size.name} px`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      for (const pg of PAGES) {
        test(`R1: the brand logo on ${pg.name} is the WR mark image, and it loads`, async ({ page }) => {
          const res = await page.goto(pg.path);
          expect(res?.status()).toBe(200);
          if (pg.name === "reader" && size.width < 800) {
            await page.getByTestId("nav-toggle").click(); // below the sidebar breakpoint the brand sits in the drawer
            await expect(page.getByTestId("nav-close")).toBeVisible();
          }
          await expect.poll(() => visibleLogoSources(page).then((s) => s.length)).toBeGreaterThan(0);
          expect(new Set(await visibleLogoSources(page))).toEqual(new Set([MARK]));
          // No initials drawn next to or instead of it.
          await expect(page.locator('[data-slot="tenant-logo"]:visible').first()).not.toHaveText(/\S/);
          const loaded = await page.locator(`${LOGO}:visible`).first().evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);
          expect(loaded).toBe(true);
        });
      }
    });
  }

  test("R2: /favicon.ico answers 200 image/x-icon", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/x-icon");
    expect((await res.body()).length).toBeGreaterThan(0);
  });

  for (const pg of PAGES) {
    test(`R2: ${pg.name} declares icon and apple-touch-icon links that answer 200, and the console has no favicon 404`, async ({ page, request }) => {
      const failed: string[] = [];
      const errors: string[] = [];
      page.on("response", (r) => {
        if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(pg.path);
      await page.waitForLoadState("networkidle");
      const hrefs = async (rel: string) => page.locator(`head link[rel~="${rel}"]`).evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
      const icons = await hrefs("icon");
      const apple = await hrefs("apple-touch-icon");
      expect(icons.length, "link[rel=icon]").toBeGreaterThan(0);
      expect(apple.length, "link[rel=apple-touch-icon]").toBeGreaterThan(0);
      for (const href of [...icons, ...apple]) {
        const res = await request.get(href);
        expect(res.status(), href).toBe(200);
        expect(res.headers()["content-type"], href).toMatch(/^image\//);
      }
      expect(failed.filter((f) => /icon/.test(f)), "failed icon requests").toEqual([]);
      expect(errors.filter((e) => /icon|404/i.test(e)), "console errors about icons or 404s").toEqual([]);
    });
  }
});
