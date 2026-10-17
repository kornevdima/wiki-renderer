// US-282 "On this page" from a button beside search: verification contract rows R1-R6 (wiki/contracts/US-282-outline-popover-contract.md).
// R7 is the existing suite plus unit tests; R8 is the operator's eyes. Pages are as tall as real ones and input is real (touch taps,
// mouse wheel, keyboard). Nothing here writes to a wiki folder.
import { expect, test, type Locator, type Page } from "@playwright/test";

const LONG = "/w/sample/guides/Long%20page.md"; // 8 h2 sections, several screens tall
const OUTLINE_LONG = "/w/sample/guides/Outline%20long.md"; // 12 h2 + 24 h3: the popover list overflows its cap
const NO_OUTLINE = "/w/second/Readme.md"; // no headings: no outline
const NAME = "On this page";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const trigger = (page: Page) => page.getByRole("button", { name: NAME });
const popover = (page: Page) => page.getByTestId("outline-popover");

async function openPage(page: Page, path: string, viewport?: { width: number; height: number }): Promise<void> {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(path);
  await expect(page.getByTestId("reader-content")).toBeVisible();
}

/** Scrolls with the mouse wheel until the page is `px` down, well past the folded copy at the top of the article. */
async function scrollDown(page: Page, px: number): Promise<void> {
  await page.mouse.move(200, 400);
  await page.mouse.wheel(0, px);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(px - 50);
  // The section spy marks the current section from the scroll; wait for the page to be still before opening the popover.
  await expect.poll(async () => {
    const a = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return a === (await page.evaluate(() => window.scrollY));
  }).toBe(true);
}

async function openPopover(page: Page): Promise<void> {
  await trigger(page).tap();
  await expect(popover(page)).toBeVisible();
}

async function box(locator: Locator, what: string) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`PRECONDITION MISSING: no box for ${what}`);
  return b;
}

test.describe("US-282 outline popover", () => {
  test("R1: a button named On this page sits right after search and opens the outline with the current section in view", async ({ page }) => {
    await openPage(page, LONG);
    await scrollDown(page, 2400);
    const search = await box(page.getByTestId("search-trigger"), "search trigger");
    const button = await box(trigger(page), "the On this page button");
    // Right after search: same row, beside it (a bar gap, not another control between).
    expect(Math.abs(button.y + button.height / 2 - (search.y + search.height / 2))).toBeLessThanOrEqual(2);
    expect(button.x).toBeGreaterThanOrEqual(search.x + search.width);
    expect(button.x - (search.x + search.width)).toBeLessThanOrEqual(16);
    expect(Math.abs(button.height - search.height)).toBeLessThanOrEqual(1);

    await openPopover(page);
    const links = popover(page).getByRole("link");
    expect(await links.count()).toBeGreaterThanOrEqual(8);
    const current = popover(page).locator('a[aria-current="location"]');
    await expect(current).toHaveCount(1);
    await expect(current).toBeVisible();
    // Visible in the list: inside the popover's box.
    const p = await box(popover(page), "popover");
    const c = await box(current, "current entry");
    expect(c.y).toBeGreaterThanOrEqual(p.y);
    expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.height);
  });

  test("R2: choosing a heading puts it at the top under the sticky bar, sets the hash, closes, and marks it current", async ({ page }) => {
    await openPage(page, LONG);
    await scrollDown(page, 600);
    await openPopover(page);
    const entry = popover(page).getByRole("link", { name: "Section 7" });
    const id = await entry.getAttribute("data-toc");
    if (!id) throw new Error("PRECONDITION MISSING: the Section 7 entry has no data-toc id");
    const before = await page.evaluate(() => window.scrollY);
    await entry.tap();
    await expect(popover(page)).toBeHidden();
    expect(new URL(page.url()).hash).toBe(`#${id}`);
    const bar = await box(page.getByTestId("app-header"), "the sticky bar");
    const heading = page.locator(`[id="${id}"]`);
    // A #fragment jump lands on the page's one `scroll-padding-top` on html, the line the rail and a native hash load use.
    const line = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    expect(line).toBeGreaterThanOrEqual(bar.y + bar.height);
    await expect.poll(async () => Math.abs((await box(heading, "target heading")).y - line), { message: "heading at the scroll-padding line" }).toBeLessThanOrEqual(2);
    expect((await box(heading, "target heading")).y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    // The scroll lock is released after closing: the page scrolls again.
    const after = await page.evaluate(() => window.scrollY);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(after);
  });

  test("R2: the entry is current right after the jump, before any further scroll", async ({ page }) => {
    await openPage(page, LONG);
    await scrollDown(page, 600);
    await openPopover(page);
    const entry = popover(page).getByRole("link", { name: "Section 5" });
    const id = await entry.getAttribute("data-toc");
    await entry.tap();
    await expect(popover(page)).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await openPopover(page);
    await expect(popover(page).locator(`a[data-toc="${id}"]`)).toHaveAttribute("aria-current", "location");
  });

  test("R3: a page with no outline has no button, at 390 and at 1199", async ({ page }) => {
    for (const width of [390, 1199]) {
      await openPage(page, NO_OUTLINE, { width, height: 844 });
      await expect(page.getByTestId("search-trigger")).toBeVisible();
      await expect(trigger(page)).toHaveCount(0);
    }
  });

  for (const [width, shows] of [
    [390, true],
    [1199, true],
    [1200, false],
    [1440, false],
  ] as const) {
    test(`R3: a page with an outline at ${width}px ${shows ? "shows" : "does not show"} the button`, async ({ page }) => {
      await openPage(page, LONG, { width, height: 900 });
      if (shows) {
        await expect(trigger(page)).toBeVisible();
        await expect(page.getByTestId("toc-rail")).toBeHidden();
      } else {
        await expect(trigger(page)).toBeHidden();
        await expect(page.getByTestId("toc-rail")).toBeVisible();
        await expect(page.getByTestId("toc-rail").getByRole("link", { name: "Section 1" })).toBeVisible();
      }
    });
  }

  test("R4: Tab reaches the button, Enter opens, focus moves in and stays in, Escape closes and returns focus to the button", async ({ page }) => {
    await openPage(page, LONG);
    const focusedIs = (testid: string) => page.evaluate((id) => document.activeElement?.getAttribute("data-testid") === id, testid);
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await focusedIs("outline-trigger");
    }
    if (!reached) throw new Error("the On this page button was not reached by Tab in 30 presses");
    await page.keyboard.press("Enter");
    await expect(popover(page)).toBeVisible();
    const inside = () => page.evaluate(() => document.querySelector('[data-testid="outline-popover"]')?.contains(document.activeElement) ?? false);
    await expect.poll(inside).toBe(true);
    const count = await popover(page).getByRole("link").count();
    for (let i = 0; i < count + 3; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab ${i + 1} stays in the popover`).toBe(true);
    }
    for (let i = 0; i < count + 3; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${i + 1} stays in the popover`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(popover(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    test(`R5: a long outline fits at ${viewport.width}x${viewport.height} and the list scrolls inside the popover`, async ({ page }) => {
      await openPage(page, OUTLINE_LONG, viewport);
      await scrollDown(page, 1500);
      await openPopover(page);
      const p = await box(popover(page), "popover");
      expect(p.y + p.height).toBeLessThanOrEqual(viewport.height);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(viewport.width);
      const list = popover(page).locator(".wr-toc--popover > ul");
      const overflows = await list.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(overflows, "PRECONDITION MISSING: the fixture outline must overflow the list").toBe(true);
      const tops = [await list.evaluate((el) => el.scrollTop)];
      const l = await box(list, "list");
      await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2);
      const pageY = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(tops[0]);
      expect(await page.evaluate(() => window.scrollY), "the page behind does not scroll").toBe(pageY);
      // Taps are at least 40 px high.
      const first = await box(popover(page).getByRole("link").first(), "first entry");
      expect(first.height).toBeGreaterThanOrEqual(40);
    });
  }

  test("R6: neither the button nor the open popover prints", async ({ page }) => {
    await openPage(page, LONG);
    await scrollDown(page, 600);
    await expect(trigger(page)).toBeVisible();
    await openPopover(page);
    await page.emulateMedia({ media: "print" });
    expect(await page.getByTestId("outline-trigger").count()).toBe(1);
    expect(await popover(page).count(), "PRECONDITION MISSING: the popover must still be open in print").toBe(1);
    expect(await page.getByTestId("outline-trigger").evaluate((el) => getComputedStyle(el).display)).toBe("none");
    expect(await popover(page).evaluate((el) => getComputedStyle(el).display)).toBe("none");
    await page.emulateMedia({ media: "screen" });
    await expect(popover(page)).toBeVisible();
  });
});
