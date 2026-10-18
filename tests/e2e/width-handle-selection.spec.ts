// BUG-065 dragging the page-width handle never selects text (wiki/contracts/BUG-065-safari-drag-selection-contract.md, R1-R5).
// Runs in Chromium and in the `webkit` project (Playwright WebKit, the nearest instrument to Safari). Real mouse events throughout.
import { expect, test, type Page } from "@playwright/test";

const HANDLE = '[role="separator"][aria-label="Page width"]';
const PAGES = [
  { name: "short page", path: "/w/second/Readme.md" },
  { name: "long page", path: "/w/sample/guides/Long%20page.md" },
];

test.use({ viewport: { width: 1600, height: 1000 } });

const selected = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");
const focusVisible = (page: Page) => page.locator(HANDLE).evaluate((el) => el.matches(":focus-visible"));

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(HANDLE)).toBeVisible();
}

/** Presses the grip's centre, sweeps left across the article's text and back down, button held; returns the selection seen at each stop. */
async function dragAcrossArticle(page: Page): Promise<string[]> {
  const h = await page.locator(HANDLE).boundingBox();
  const a = await page.locator('[data-testid="reader-content"]').boundingBox();
  if (!h || !a) throw new Error("PRECONDITION MISSING: no box for the grip or the article");
  const x0 = h.x + h.width / 2;
  const y0 = h.y + h.height / 2;
  const seen: string[] = [];
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (const [x, y] of [
    [x0 - 120, y0 - 60],
    [a.x + a.width / 2, a.y + 40],
    [a.x + 20, a.y + 80],
    [x0 + 60, y0 + 100],
  ]) {
    await page.mouse.move(x, y, { steps: 8 });
    seen.push(await selected(page));
  }
  await page.mouse.up();
  seen.push(await selected(page));
  return seen;
}

for (const p of PAGES) {
  test(`R1/R2 dragging the grip across the article selects nothing, during or after (${p.name})`, async ({ page }) => {
    await open(page, p.path);
    const seen = await dragAcrossArticle(page);
    expect(seen).toEqual(seen.map(() => ""));
  });
}

test("R4 a mouse drag leaves no focus ring on the grip; Tab shows it", async ({ page }) => {
  await open(page, PAGES[0].path);
  await dragAcrossArticle(page);
  expect(await focusVisible(page)).toBe(false);
  await page.reload();
  await expect(page.locator(HANDLE)).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await page.locator(HANDLE).evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.locator(HANDLE)).toBeFocused();
  expect(await focusVisible(page)).toBe(true);
});

test("R5 a normal mouse selection in the article works after a drag", async ({ page }) => {
  await open(page, PAGES[0].path);
  await dragAcrossArticle(page);
  const para = page.locator('[data-testid="reader-content"] p').first();
  const b = await para.boundingBox();
  if (!b) throw new Error("PRECONDITION MISSING: no paragraph box");
  await page.mouse.move(b.x + 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + Math.min(b.width - 2, 200), b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await selected(page)).length).toBeGreaterThan(0);
});
