// E2E for the config file (US-276): two servers WITHOUT the suite's WIKI_DIRS, each pointing WIKI_RENDERER_CONFIG at a temp file.
//   :3300  the file is the source (starts with no file; the specs rewrite it); WIKI_DIRS unset.
//   :3301  WIKI_DIRS and a config file both set; WIKI_DIRS must win.
// Both are `next start` over one production build (two `next dev` servers would fight over the .next dev lock), so run
// `npm run build` first. Run: `npx playwright test -c playwright.config-file.config.ts`. The temp folder is outside the
// repo and never the real user config folder; the specs create and remove it.
import os from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

export const CONFIG_DIR = process.env.E2E_CONFIG_DIR ?? path.join(os.tmpdir(), "wiki-renderer-e2e-us276");
const FILE_PORT = 3300;
const ENV_PORT = 3301;

const base = { WIKI_RECHECK_MS: "0" };

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "config-file.spec.ts",
  // Serial: the specs share one mutable config file.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  webServer: [
    {
      command: `next start --hostname 127.0.0.1 --port ${FILE_PORT}`,
      url: `http://127.0.0.1:${FILE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...base, WIKI_DIRS: "", WIKI_RENDERER_CONFIG: path.join(CONFIG_DIR, "file-source", "config.json") },
    },
    {
      command: `next start --hostname 127.0.0.1 --port ${ENV_PORT}`,
      url: `http://127.0.0.1:${ENV_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...base,
        WIKI_DIRS: "envwiki=tests/fixtures/second-wiki",
        WIKI_RENDERER_CONFIG: path.join(CONFIG_DIR, "env-override", "config.json"),
      },
    },
  ],
});
