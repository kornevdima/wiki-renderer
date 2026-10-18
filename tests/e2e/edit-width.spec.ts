// US-291 the page-width handle also works in edit mode (wiki/contracts/US-291-edit-width-contract.md, R1-R4).
// The width is the one `wr-page-width` cookie the rendered page uses. Every test gets a fresh browser context, so each starts at Reading.
// The one test that saves (R4b) writes into the wiki folder, so it runs only when E2E_FIXTURES_COPY=1: the server's WIKI_DIRS must then
// be a temp copy of tests/fixtures, never the fixtures themselves.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const COOKIE = "wr-page-width";
const SIDEBAR_COOKIE = "wr-sidebar";
const EDIT = "/w/sample/guides/Long%20page.md?view=edit";
const PAGE = "/w/sample/guides/Long%20page.md";
const SOURCE = "/w/sample/guides/Long%20page.md?view=source";
const HANDLE = '[role="separator"][aria-label="Page width"]';
const GUIDE = '[data-slot="width-handle-guide"]';
const CONTENT = '[data-testid="reader-content"]';
const SHELL = '[data-testid="reader-shell"]';

// As in page-width.spec.ts (1600x1000): A4 portrait 190 mm, A4 landscape 277 mm, Reading 36em.
const READING_PX = 576;
const PORTRAIT_PX = 718.11;
const LANDSCAPE_PX = 1046.93;

test.use({ viewport: { width: 1600, height: 1000 } });

const cookie = async (context: BrowserContext, name = COOKIE) => (await context.cookies()).find((c) => c.name === name)?.value ?? null;
const contentWidth = async (page: Page) => {
  const b = await page.locator(CONTENT).boundingBox();
  if (!b) throw new Error("PRECONDITION MISSING: no box for the article");
  return b.width;
};

async function openEdit(page: Page, path = EDIT): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("edit-save")).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator(HANDLE)).toBeVisible();
}

/** Presses the grip and moves the pointer so the article is `toWidth` px wide (symmetric handle: half the change per side); the button stays down. */
async function dragTo(page: Page, toWidth: number): Promise<void> {
  const h = (await page.locator(HANDLE).boundingBox())!;
  const start = await contentWidth(page);
  const y = h.y + h.height / 2;
  const x0 = h.x + h.width / 2;
  const x1 = x0 + (toWidth - start) / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1 - 10, y, { steps: 4 });
  await page.mouse.move(x1, y, { steps: 4 });
}

test.describe("US-291 page width in edit mode", () => {
  test("R1 the handle is in the editor and shows four guides while dragging; the source view and the home list have none", async ({ page }) => {
    await openEdit(page);
    expect(await contentWidth(page)).toBeCloseTo(READING_PX, 0);
    await expect(page.locator(GUIDE)).toHaveCount(0);
    await dragTo(page, PORTRAIT_PX);
    await expect(page.locator(GUIDE)).toHaveCount(8); // a marker on each side of each of the four guides
    await expect(page.locator('[data-slot="width-handle-guide-label"]')).toHaveCount(4);
    await page.mouse.up();
    await expect(page.locator(GUIDE)).toHaveCount(0);

    await page.goto(SOURCE);
    await expect(page.getByTestId("reader-content")).toBeVisible();
    await expect(page.locator(HANDLE)).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator(HANDLE)).toHaveCount(0);
  });

  test("R2 dragging in the editor changes its width and snaps to the A4 portrait, A4 landscape and Full guides, free between", async ({ page, context }) => {
    await openEdit(page);
    await dragTo(page, PORTRAIT_PX);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("a4-portrait");
    expect(await contentWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);
    await expect(page.locator("html")).toHaveAttribute("data-page-width", "a4-portrait");
    // The editor itself follows the article, and the toolbar is no wider than it.
    const editor = (await page.getByTestId("edit-view").boundingBox())!;
    expect(editor.width).toBeGreaterThan(PORTRAIT_PX - 2);
    expect(editor.width).toBeLessThanOrEqual(PORTRAIT_PX + 1);

    await dragTo(page, 820);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("820");
    expect(await contentWidth(page)).toBeCloseTo(820, 0);

    await dragTo(page, LANDSCAPE_PX);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("a4-landscape");
    expect(await contentWidth(page)).toBeCloseTo(LANDSCAPE_PX, 0);

    await dragTo(page, 5000);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("full");
  });

  test("R3 one width carries between page and edit, both ways, in the same cookie", async ({ page, context }) => {
    await page.goto(PAGE);
    await expect(page.locator(HANDLE)).toBeVisible();
    await dragTo(page, PORTRAIT_PX);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("a4-portrait");
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/view=edit/);
    await expect(page.locator(HANDLE)).toBeVisible();
    expect(await contentWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);

    await dragTo(page, 820);
    await page.mouse.up();
    await expect.poll(() => cookie(context)).toBe("820");
    await page.goto(PAGE);
    await expect(page.locator(HANDLE)).toBeVisible();
    expect(await contentWidth(page)).toBeCloseTo(820, 0);
    expect(await cookie(context)).toBe("820");
  });

  test("R2 Home on the handle resets the width to Reading in edit mode", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: COOKIE, value: "a4-portrait", url: baseURL ?? "http://127.0.0.1:3100" }]);
    await openEdit(page);
    expect(await contentWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);
    await page.locator(HANDLE).focus();
    await page.keyboard.press("Home");
    await expect.poll(() => cookie(context)).toBeNull();
    expect(await contentWidth(page)).toBeCloseTo(READING_PX, 0);
  });

  test("R3 a stored width opens the editor at it with no jump (the first HTML carries it)", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: COOKIE, value: "a4-portrait", url: baseURL ?? "http://127.0.0.1:3100" }]);
    await openEdit(page);
    expect(await contentWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);
  });

  test("R4a after a drag the toolbar is there and the editor takes typing, and the editable fits its column", async ({ page }) => {
    await openEdit(page);
    await dragTo(page, PORTRAIT_PX);
    await page.mouse.up();
    await expect(page.getByRole("toolbar").first()).toBeVisible();
    const editable = page.locator('[contenteditable="true"]').first();
    await editable.click();
    await page.keyboard.type("zz");
    await expect(editable).toContainText("zz");
    await expect(page.getByTestId("edit-status")).not.toHaveText("");
    const box = (await editable.boundingBox())!;
    const col = (await page.locator(CONTENT).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(col.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(col.x + col.width + 1);
  });

  test("R4b saving at a non-Reading width still writes the file (temp copy only)", async ({ page, request, context, baseURL }) => {
    test.skip(process.env.E2E_FIXTURES_COPY !== "1", "writes into the wiki folder: set E2E_FIXTURES_COPY=1 with WIKI_DIRS on a temp copy");
    await context.addCookies([{ name: COOKIE, value: "a4-portrait", url: baseURL ?? "http://127.0.0.1:3100" }]);
    await openEdit(page, "/w/second/Readme.md?view=edit");
    const editable = page.locator('[contenteditable="true"]').first();
    await editable.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" widthsaved");
    await page.getByTestId("edit-save").click();
    await expect.poll(async () => (await request.get("/w/second/Readme.md?view=source")).text(), { timeout: 15_000 }).toContain("widthsaved");
    expect(await contentWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);
  });

  test.describe("at 1280x900", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("R4c a drag to A4 landscape collapses the sidebar during the drag (nothing stored yet) and stores both on release", async ({ page, context }) => {
      await openEdit(page);
      await expect(page.locator(SHELL)).not.toHaveAttribute("data-sidebar-collapsed", /.*/);
      await dragTo(page, LANDSCAPE_PX);
      await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
      expect(await cookie(context)).toBeNull();
      await expect.poll(async () => Math.abs((await contentWidth(page)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
      await page.mouse.up();
      await expect.poll(() => cookie(context)).toBe("a4-landscape");
      await expect.poll(() => cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");
    });

    test("R4c the sidebar's own collapse button still widens the editor's room", async ({ page }) => {
      await openEdit(page);
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
      await expect(page.locator(HANDLE)).toBeVisible();
    });
  });
});
