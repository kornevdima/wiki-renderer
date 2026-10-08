import { expect, test } from "@playwright/test";

test("home lists every configured wiki with its folder", async ({ page }) => {
  await page.goto("/");
  const list = page.getByTestId("wiki-list");
  await expect(list.getByRole("link", { name: "Sample" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Second" })).toBeVisible();
  await expect(list).toContainText("tests/fixtures/sample-wiki");
});

test("a wiki's landing redirects to its first page and renders Obsidian syntax", async ({ page }) => {
  await page.goto("/w/sample");
  await expect(page).toHaveURL(/\/w\/sample\/.+/);
  await page.goto("/w/sample/index.md");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1, name: "Sample wiki" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Getting started" }).first()).toHaveAttribute("href", /\/w\/sample\/guides\//);
  await expect(main.locator(".callout, [data-callout]").first()).toBeVisible();
  await expect(main.locator("img[src*='/api/wikis/sample/asset/']")).toBeVisible();
  await expect(page.getByTestId("reader-wiki-folder")).toContainText("sample-wiki");
});

test("the source view shows the raw Markdown", async ({ page }) => {
  await page.goto("/w/sample/guides/Getting%20started.md?view=source");
  await expect(page.locator("main")).toContainText("## Install");
});

test("an unknown wiki is a 404", async ({ page }) => {
  const res = await page.goto("/w/nope");
  expect(res?.status()).toBe(404);
});
