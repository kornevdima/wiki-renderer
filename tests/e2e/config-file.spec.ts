// US-276 the wiki list comes from a config file: verification contract rows R2, R3, R5 (e2e part), R7 (e2e part) and
// R11's screenshots (wiki/contracts/US-276-config-file-contract.md). These run through playwright.config-file.config.ts,
// not the suite's default config: its servers have no WIKI_DIRS and read WIKI_RENDERER_CONFIG from a temp folder.
//   :3300 file source (WIKI_DIRS unset)   :3301 WIKI_DIRS set plus a config file that must be ignored
// Never touches the real user config folder, and nothing writes into a wiki folder.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type BrowserContext } from "@playwright/test";

const FILE_URL = "http://127.0.0.1:3300";
const ENV_URL = "http://127.0.0.1:3301";
const CONFIG_DIR = process.env.E2E_CONFIG_DIR ?? path.join(os.tmpdir(), "wiki-renderer-e2e-us276");
const FILE_CONFIG = path.join(CONFIG_DIR, "file-source", "config.json");
const ENV_CONFIG = path.join(CONFIG_DIR, "env-override", "config.json");
const SAMPLE = path.resolve("tests/fixtures/sample-wiki");
const SECOND = path.resolve("tests/fixtures/second-wiki");
const SHOTS = process.env.E2E_SCREENSHOT_DIR; // R11: set to write the screenshots

const wiki = (id: string, root: string) => ({ id, name: id.toUpperCase(), root });

function writeConfig(file: string, content: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

function removeConfig(file: string): void {
  rmSync(file, { force: true });
}

test.describe("US-276 config file", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    // Guard: the servers come from playwright.config-file.config.ts. Fail fast, not as a fake app failure.
    for (const url of [FILE_URL, ENV_URL]) {
      const res = await request.get(`${url}/api/health`).catch(() => null);
      if (!res?.ok()) throw new Error(`PRECONDITION MISSING: server on ${url} (run with -c playwright.config-file.config.ts after npm run build)`);
    }
    rmSync(CONFIG_DIR, { recursive: true, force: true });
    mkdirSync(CONFIG_DIR, { recursive: true });
  });

  test.afterAll(() => {
    rmSync(CONFIG_DIR, { recursive: true, force: true });
  });

  test("R2: no file and no WIKI_DIRS: home shows the empty state naming the config path, health reports no wikis", async ({ page, request }) => {
    removeConfig(FILE_CONFIG);
    const res = await page.goto(`${FILE_URL}/`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("no-wikis")).toBeVisible();
    await expect(page.getByTestId("config-path")).toHaveText(FILE_CONFIG);
    await expect(page.getByTestId("config-error")).toHaveCount(0);

    const health = await request.get(`${FILE_URL}/api/health`);
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, wikis: [] });
  });

  test("R11: screenshots of the empty state and the config-error state, light and dark", async ({ browser }) => {
    test.skip(!SHOTS, "set E2E_SCREENSHOT_DIR to write the R11 screenshots");
    mkdirSync(SHOTS!, { recursive: true });
    const shoot = async (state: "empty" | "error", scheme: "light" | "dark") => {
      const context: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
      await context.addCookies([{ name: "theme", value: scheme, url: FILE_URL }]);
      const page = await context.newPage();
      await page.goto(`${FILE_URL}/`);
      await expect(page.getByTestId(state === "empty" ? "no-wikis" : "config-error")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      await page.screenshot({ path: path.join(SHOTS!, `us276-${state}-${scheme}.png`) });
      await context.close();
    };
    removeConfig(FILE_CONFIG);
    await shoot("empty", "light");
    await shoot("empty", "dark");
    writeConfig(FILE_CONFIG, '{ "wikis": [ ');
    await shoot("error", "light");
    await shoot("error", "dark");
    removeConfig(FILE_CONFIG);
  });

  test("R7: a bad file keeps the app up (200), names the problem and the path, and keeps the last good list", async ({ page, request }) => {
    removeConfig(FILE_CONFIG);
    await page.goto(`${FILE_URL}/`);
    await expect(page.getByTestId("no-wikis")).toBeVisible();

    // First read of a bad file: no last good list, so an error and no wikis.
    writeConfig(FILE_CONFIG, "{ not json");
    let res = await page.goto(`${FILE_URL}/`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("config-error")).toContainText(FILE_CONFIG);
    await expect(page.getByTestId("no-wikis")).toHaveCount(0);
    expect((await request.get(`${FILE_URL}/api/health`)).status()).toBe(200);

    // Last good list is kept through each kind of error.
    writeConfig(FILE_CONFIG, { wikis: [wiki("alpha", SAMPLE), wiki("beta", SECOND)] });
    await page.goto(`${FILE_URL}/`);
    await expect(page.getByTestId("wiki-list").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("config-error")).toHaveCount(0);

    const bad: Array<[string, unknown]> = [
      ["invalid JSON", '{ "wikis": [ '],
      ["bad id", { wikis: [wiki("Not Valid!", SAMPLE)] }],
      ["duplicate id", { wikis: [wiki("alpha", SAMPLE), wiki("alpha", SECOND)] }],
    ];
    for (const [kind, content] of bad) {
      writeConfig(FILE_CONFIG, content);
      res = await page.goto(`${FILE_URL}/`);
      expect(res?.status(), kind).toBe(200);
      await expect(page.getByTestId("config-error"), kind).toContainText(FILE_CONFIG);
      await expect(page.getByTestId("wiki-list").getByRole("listitem"), kind).toHaveCount(2);
      expect((await request.get(`${FILE_URL}/api/health`)).status(), kind).toBe(200);
      expect((await request.get(`${FILE_URL}/w/alpha`)).status(), kind).toBe(200);
    }
    removeConfig(FILE_CONFIG);
  });

  test("R3: a change to the file shows without a restart; a removed wiki's reader URL answers 404", async ({ page, request }) => {
    writeConfig(FILE_CONFIG, { wikis: [wiki("alpha", SAMPLE)] });
    const one = await request.get(`${FILE_URL}/`, { maxRedirects: 0 });
    expect(one.status()).toBeGreaterThanOrEqual(300);
    expect(one.status()).toBeLessThan(400);
    expect(one.headers()["location"]).toContain("/w/alpha");
    expect((await request.get(`${FILE_URL}/w/alpha`)).status()).toBe(200);

    writeConfig(FILE_CONFIG, { wikis: [wiki("alpha", SAMPLE), wiki("beta", SECOND)] });
    await page.goto(`${FILE_URL}/`);
    const items = page.getByTestId("wiki-list").getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(page.locator('a[href="/w/alpha"]')).toBeVisible();
    await expect(page.locator('a[href="/w/beta"]')).toBeVisible();
    expect((await request.get(`${FILE_URL}/w/beta`)).status()).toBe(200);
    expect(await (await request.get(`${FILE_URL}/api/health`)).json()).toMatchObject({ wikis: ["alpha", "beta"] });

    writeConfig(FILE_CONFIG, { wikis: [wiki("alpha", SAMPLE)] });
    expect((await request.get(`${FILE_URL}/w/beta`)).status()).toBe(404);
    expect((await request.get(`${FILE_URL}/w/alpha`)).status()).toBe(200);
    removeConfig(FILE_CONFIG);
  });

  test("R5: WIKI_DIRS overrides the config file; only its wikis are served", async ({ request }) => {
    writeConfig(ENV_CONFIG, { wikis: [wiki("fileone", SAMPLE), wiki("filetwo", SECOND)] });
    const health = await request.get(`${ENV_URL}/api/health`);
    expect(health.status()).toBe(200);
    expect((await health.json()).wikis).toEqual(["envwiki"]);
    expect((await request.get(`${ENV_URL}/w/envwiki`)).status()).toBe(200);
    expect((await request.get(`${ENV_URL}/w/fileone`)).status()).toBe(404);
    expect((await request.get(`${ENV_URL}/w/filetwo`)).status()).toBe(404);
    removeConfig(ENV_CONFIG);
  });
});
