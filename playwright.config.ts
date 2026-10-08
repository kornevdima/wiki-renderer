// E2E: one `next dev` against the sample wiki in `tests/fixtures/sample-wiki`, on its own port so a running dev server
// on :3000 is left alone.
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
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
