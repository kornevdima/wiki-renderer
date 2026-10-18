// E2E: one `next dev` against the sample wiki in `tests/fixtures/sample-wiki`, on its own port so a running dev server
// on :3000 is left alone.
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // US-276: the config-file specs need servers without WIKI_DIRS; they run through playwright.config-file.config.ts (so does US-277's settings.spec.ts).
  testIgnore: ["**/config-file.spec.ts", "**/settings.spec.ts", "**/brand-initials.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // BUG-065: Playwright WebKit (the nearest instrument to Safari) runs the page-width handle's selection spec only.
  projects: [
    { name: "chromium" },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: "**/width-handle-selection.spec.ts" },
  ],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `next dev --hostname 127.0.0.1 --port ${PORT}`,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { WIKI_DIRS: "sample=tests/fixtures/sample-wiki,second=tests/fixtures/second-wiki", WIKI_RECHECK_MS: "0" },
      },
});
