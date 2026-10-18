// US-289 R3: branding that is set still wins over the default mark. Two servers on the config project's production build
// (playwright.config-file.config.ts), neither with the default branding:
//   :3302  BRAND_INITIALS=TF            -> the initials "TF", no image
//   :3303  BRAND_NAME="Acme Docs"       -> the derived initials (AD), no image (a custom name alone keeps its initials)
import { expect, test } from "@playwright/test";

const SERVERS = [
  { name: "BRAND_INITIALS=TF", url: "http://127.0.0.1:3302", initials: "TF" },
  { name: 'BRAND_NAME="Acme Docs"', url: "http://127.0.0.1:3303", initials: "AD" },
];

test.describe("US-289 branding wins over the default mark", () => {
  test.beforeAll(async ({ request }) => {
    for (const s of SERVERS) {
      const res = await request.get(`${s.url}/api/health`).catch(() => null);
      if (!res?.ok()) throw new Error(`PRECONDITION MISSING: server on ${s.url} (run with -c playwright.config-file.config.ts after npm run build)`);
    }
  });

  for (const s of SERVERS) {
    for (const path of ["/", "/settings"]) {
      test(`R3: with ${s.name} ${path} shows the initials ${s.initials} in the logo and not the WR mark image`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${s.url}${path}`);
        const logo = page.locator('[data-slot="tenant-logo"]:visible').first();
        await expect(logo).toHaveText(s.initials);
        await expect(page.locator('[data-slot="tenant-logo-image"]')).toHaveCount(0);
        await expect(page.locator('img[src="/wr-mark.svg"]')).toHaveCount(0);
      });
    }
  }
});
