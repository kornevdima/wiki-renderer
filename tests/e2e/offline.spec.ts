// US-278 R8: the app is offline. A browser pass through the reader, search, the editor and Settings makes no request to any
// host but the one under test (a font CDN, analytics, a map tile, a remote image would show up here). Server-side calls are
// outside what a browser sees; the app has no HTTP client dependency (see the report). Runs against any E2E_BASE_URL, so it
// also covers an unpacked portable build. Settings is reached on the main project's server (a config file is not needed to read it).
import { expect, test } from "@playwright/test";

test("R8: reader, search, source, editor and Settings make zero requests outside the app's own origin", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("PRECONDITION MISSING: a baseURL");
  const own = new URL(baseURL).origin;
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) return;
    if (new URL(url).origin !== own) outside.push(url);
  });

  await page.goto("/");
  await page.goto("/w/sample/index.md");
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible();
  const index = page.waitForResponse((r) => r.url().includes("/api/wikis/sample/search-index/"));
  await page.getByTestId("search-trigger").click();
  expect((await index).status()).toBe(200);
  await page.keyboard.press("Escape");
  await page.goto("/w/sample/guides/Getting%20started.md?view=source");
  await expect(page.locator("main")).toContainText("## Install");
  await page.goto("/w/sample/guides/Getting%20started.md?view=edit");
  await expect(page.getByTestId("edit-save")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("settings-version")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(outside).toEqual([]);
});
