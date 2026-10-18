// US-286 one settings menu in the top bar: verification contract rows R1-R5 (wiki/contracts/US-286-settings-menu-contract.md).
// R6 (nothing else moved) is the rest of the suite. Needs 2 wikis (WIKI_DIRS=sample=...,second=...) so `/` lists them instead of redirecting.
// The theme is kept in the `theme` cookie and rendered by the server as `<html data-theme>`; each test has a fresh browser context.
import { expect, test, type Page } from "@playwright/test";

const READER = "/w/sample/index.md";
const PAGES = [
  { name: "home", path: "/" },
  { name: "reader", path: READER },
] as const;
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const TRIGGER = '[data-testid="settings-menu"]';
const REMOVED_IDS = ["theme-control", "theme-select", "locale-switcher"];

async function openMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "Settings" });
  await trigger.click();
  await expect(page.getByTestId("narrow-theme-dark")).toBeVisible();
  return trigger;
}

test.describe("US-286 settings menu", () => {
  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      test(`R1: ${pg.name} at ${vp.name} has one Settings button ending the bar and no other theme or language control`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(pg.path);
        const buttons = page.getByRole("button", { name: "Settings", exact: true });
        await expect(buttons).toHaveCount(1);
        await expect(page.locator(TRIGGER)).toHaveCount(1);
        await expect(page.locator(TRIGGER)).toBeVisible();
        // No select / combobox / listbox anywhere, and none of the removed controls.
        await expect(page.locator("select, [role='combobox'], [role='listbox']")).toHaveCount(0);
        for (const id of REMOVED_IDS) await expect(page.getByTestId(id)).toHaveCount(0);
        await expect(page.locator("[data-testid^='theme-option-']")).toHaveCount(0);
        await expect(page.locator("[data-testid^='settings-language']")).toHaveCount(0); // menu content mounts on open only
        // The bar ends with it: no other visible control in the banner sits to its right.
        const bar = page.locator("header").first();
        const triggerBox = await page.locator(TRIGGER).boundingBox();
        if (!triggerBox) throw new Error("PRECONDITION MISSING: settings trigger has no box");
        const others = await bar.locator("a, button, input, [role='button']").evaluateAll((els, selfId) => {
          return els
            .filter((el) => el.getAttribute("data-testid") !== selfId)
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r) => r.right);
        }, "settings-menu");
        for (const right of others) expect(right).toBeLessThanOrEqual(triggerBox.x + 1);
      });
    }
  }

  for (const pg of PAGES) {
    test(`R2: ${pg.name} menu shows Theme (Light, Dark, System), a separator, and Language (English checked), no account rows`, async ({ page }) => {
      await page.goto(pg.path);
      await openMenu(page);
      const menu = page.getByRole("menu");
      for (const id of ["light", "dark", "system"]) {
        await expect(menu.getByTestId(`narrow-theme-${id}`)).toHaveAttribute("role", "menuitemradio");
      }
      await expect(menu.getByTestId("narrow-theme-system")).toHaveAttribute("aria-checked", "true"); // fresh context: no cookie
      await expect(menu.getByTestId("narrow-theme-light")).toHaveAttribute("aria-checked", "false");
      await expect(menu.getByTestId("narrow-theme-dark")).toHaveAttribute("aria-checked", "false");
      await expect(menu.getByTestId("settings-language-en")).toHaveAttribute("role", "menuitemradio");
      await expect(menu.getByTestId("settings-language-en")).toHaveAttribute("aria-checked", "true");
      await expect(menu.getByTestId("settings-language")).toHaveAttribute("aria-labelledby", /.+/);
      await expect(menu.getByRole("menuitemradio")).toHaveCount(4); // three themes + English: nothing else
      // No account rows (Sign out, Profile ...): the one plain item is the Settings link (US-277), below Language.
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveAttribute("data-testid", "settings-link");
      await expect(menu.getByRole("separator")).not.toHaveCount(0);
      // Order in the DOM: Theme items, separator, then Language.
      const order = await menu.locator("[role='menuitemradio'], [role='separator']").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid") ?? el.getAttribute("role")),
      );
      const sep = order.indexOf("separator");
      expect(sep).toBeGreaterThan(0);
      expect(order.slice(0, sep).sort()).toEqual(["narrow-theme-dark", "narrow-theme-light", "narrow-theme-system"]);
      expect(order.slice(sep + 1)).toEqual(["settings-language-en", "separator"]); // Language, then the separator above Settings (US-277)
    });
  }

  for (const pg of PAGES) {
    test(`R3: ${pg.name} choosing Dark sets the theme and it survives a reload`, async ({ page, context }) => {
      await page.goto(pg.path);
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
      await openMenu(page);
      await page.getByTestId("narrow-theme-dark").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect.poll(async () => (await context.cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await openMenu(page);
      await expect(page.getByTestId("narrow-theme-dark")).toHaveAttribute("aria-checked", "true");
      // And back to System removes the attribute.
      await page.getByTestId("narrow-theme-system").click();
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    });
  }

  for (const pg of PAGES) {
    test(`R4: ${pg.name} keyboard opens with Enter, arrows move, Escape closes and returns focus`, async ({ page }) => {
      await page.goto(pg.path);
      const trigger = page.locator(TRIGGER);
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(page.getByRole("menuitemradio").first()).toBeFocused();
      const first = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
      await page.keyboard.press("ArrowDown");
      // The roving focus moves on the next frame: poll it rather than read it at once.
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).not.toBe(first);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBeTruthy();
      await page.keyboard.press("ArrowUp");
      await expect(page.getByRole("menuitemradio").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  for (const pg of PAGES) {
    test(`R5: ${pg.name} at 390px the same button opens the same menu`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(pg.path);
      await openMenu(page);
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
      await expect(menu.getByTestId("settings-language-en")).toHaveAttribute("aria-checked", "true");
      const box = await menu.boundingBox();
      if (!box) throw new Error("PRECONDITION MISSING: menu has no box");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await page.getByTestId("narrow-theme-dark").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });
  }
});
