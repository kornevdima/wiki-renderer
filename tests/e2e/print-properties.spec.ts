// BUG-066 R2: All properties prints in one piece. Chromium paginates for real (print.spec.ts proves it with page.pdf); WebKit cannot
// (`page.pdf` is Chromium-only), so this spec asserts the CSS that keeps the block whole in whatever browser runs it: print media
// emulated, `break-inside: avoid` on the plain block wrapper, the details and the dl, and the body open (every row visible).
// The Safari claim itself is the operator's print (R5); a WebKit project, when playwright.config.ts has one, picks this spec up as is.
import { expect, test } from "@playwright/test";

const WITH_PROPERTIES = "/w/sample/guides/Print%20with%20properties.md";

test("R2: in print media All properties carries break-inside: avoid on its wrapper, details and dl, and renders open", async ({ page }) => {
  await page.goto(WITH_PROPERTIES);
  await expect(page.getByTestId("reader-content")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const panel = page.getByTestId("frontmatter-panel");
  const wrapper = page.locator(".wr-properties-block");
  await expect(wrapper).toHaveCount(1);
  expect(await wrapper.evaluate((el, id) => el.firstElementChild === el.querySelector(`[data-testid="${id}"]`), "frontmatter-panel")).toBe(true);
  for (const el of [wrapper, panel, panel.locator("dl")]) {
    await expect(el).toHaveCSS("break-inside", "avoid");
    await expect(el).toHaveCSS("display", "block");
  }
  // the wrapper is a plain block in a block flow, not a flex/grid item that WebKit would fragment differently
  expect(await wrapper.evaluate((el) => getComputedStyle(el.parentElement as Element).display)).toBe("flow-root");
  // open in print: the details has no `open` attribute, yet every row has a box
  expect(await panel.evaluate((el) => el.hasAttribute("open"))).toBe(false);
  const rows = panel.locator("dl > div");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
});
