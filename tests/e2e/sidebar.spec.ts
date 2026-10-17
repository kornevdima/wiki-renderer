// US-281 the navigation sidebar collapses: verification contract rows R1-R6 (wiki/contracts/US-281-sidebar-collapse-contract.md).
// R7 (print unchanged) is print.spec.ts; R8 is the operator's eyes. The choice is kept in the `wr-sidebar` cookie (`collapsed`; absent =
// expanded) and the page width in `wr-page-width`. Every test gets a fresh browser context, so each starts expanded and at Reading.
// Run against a production build: the Next dev "1 Issue" badge covers the footer button. Nothing here writes to a wiki folder.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SIDEBAR_COOKIE = "wr-sidebar";
const WIDTH_COOKIE = "wr-page-width";
const RAIL_PAGE = "/w/sample/guides/Wide%20page.md"; // frontmatter + three headings: Properties and "On this page" rail
const OTHER_PAGE = "/w/second/Readme.md";
const NO_PANEL_PAGE = OTHER_PAGE; // no frontmatter, no headings: no Properties, no outline

const HANDLE = '[role="separator"][aria-label="Page width"]';
const SHELL = '[data-testid="reader-shell"]';
const SIDEBAR = 'aside[data-slot="sidebar"]';
const CONTENT = '[data-testid="reader-content"]';

// A4 landscape at 10 mm print margins (277 mm), as in page-width.spec.ts.
const LANDSCAPE_PX = 1046.93;

async function addCookie(context: BrowserContext, baseURL: string | undefined, name: string, value: string): Promise<void> {
  await context.addCookies([{ name, value, url: baseURL ?? "http://127.0.0.1:3100" }]);
}

async function cookie(context: BrowserContext, name: string): Promise<string | null> {
  return (await context.cookies()).find((c) => c.name === name)?.value ?? null;
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(HANDLE)).toBeVisible();
}

async function width(page: Page, selector: string): Promise<number> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`PRECONDITION MISSING: no box for ${selector}`);
  return b.width;
}

/** A theme length (`--sidebar-w`, `--sidebar-w-collapsed`) resolved to px by the browser, never hard-coded. */
async function themePx(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${n})`;
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  }, name);
}

/** The width of the content slot (the column's parent): what the sidebar's width changes. */
async function slotWidth(page: Page): Promise<number> {
  return page.locator(".wr-column").first().evaluate((el) => el.parentElement!.getBoundingClientRect().width);
}

/** Full on this page, read from the live layout: the slot's content width less the side panel's room (the probe), never a hard-coded px. */
async function liveFullPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const col = document.querySelector(".wr-column")!;
    const slot = col.parentElement!;
    const st = getComputedStyle(slot);
    const probe = col.querySelector<HTMLElement>("[data-width-extra-probe]")!;
    return slot.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - probe.getBoundingClientRect().width;
  });
}

const snappedGuides = (page: Page) => page.locator('[data-slot="width-handle-guide"][data-snapped]');
const readout = (page: Page) => page.locator('[data-slot="width-handle-readout"]');
/** Pointer x less the grip's centre x. */
async function gripGap(page: Page, pointerX: number): Promise<number> {
  const b = (await page.locator(HANDLE).boundingBox())!;
  return pointerX - (b.x + b.width / 2);
}

type Rect = { x: number; y: number; width: number; height: number };
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const collapseButton = (page: Page) => page.getByRole("button", { name: "Collapse sidebar" });
const expandButton = (page: Page) => page.getByRole("button", { name: "Expand sidebar" });

async function expectCollapsed(page: Page, collapsed: boolean): Promise<void> {
  if (collapsed) {
    await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
    await expect(expandButton(page)).toHaveAttribute("aria-pressed", "true");
  } else {
    await expect(page.locator(SHELL)).not.toHaveAttribute("data-sidebar-collapsed", /.*/);
    await expect(collapseButton(page)).toHaveAttribute("aria-pressed", "false");
  }
}

/** Focuses the handle and presses PageUp (the next guide) until the stored width is `id`; the guides are not in a fixed order at every width. */
async function pageUpTo(page: Page, context: BrowserContext, id: string): Promise<void> {
  await page.locator(HANDLE).focus();
  for (let i = 0; i < 5 && (await cookie(context, WIDTH_COOKIE)) !== id; i++) await page.keyboard.press("PageUp");
  expect(await cookie(context, WIDTH_COOKIE)).toBe(id);
}

test.describe("US-281 sidebar collapse", () => {
  test.describe("at 1440x900", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("R1 the button collapses the sidebar to the strip and widens the content by the column delta; the same button expands it", async ({ page, context }) => {
      await open(page, RAIL_PAGE);
      await expectCollapsed(page, false);
      await expect(page.getByTestId("reader-nav-column")).toBeVisible();
      const full = await themePx(page, "--sidebar-w");
      const strip = await themePx(page, "--sidebar-w-collapsed");
      expect(full).toBeGreaterThan(strip);
      const sidebarBefore = await width(page, SIDEBAR);
      expect(Math.abs(sidebarBefore - full)).toBeLessThanOrEqual(2);
      const slotBefore = await slotWidth(page);

      await collapseButton(page).click();
      await expectCollapsed(page, true);
      await expect(page.getByTestId("reader-nav-column")).toBeHidden();
      await expect(page.getByTestId("brand")).toBeVisible();
      await expect.poll(async () => Math.abs((await width(page, SIDEBAR)) - strip)).toBeLessThanOrEqual(2);
      await expect.poll(async () => Math.abs((await slotWidth(page)) - slotBefore - (full - strip))).toBeLessThanOrEqual(2);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");

      await expandButton(page).click();
      await expectCollapsed(page, false);
      await expect(page.getByTestId("reader-nav-column")).toBeVisible();
      await expect.poll(async () => Math.abs((await slotWidth(page)) - slotBefore)).toBeLessThanOrEqual(2);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
    });

    test("R2 the choice survives a reload and another page, and the server's first HTML already carries it", async ({ page, context, request }) => {
      // The response HTML, read without a browser: no cookie is expanded, the cookie is collapsed.
      const plain = await (await request.get(RAIL_PAGE)).text();
      expect(plain).not.toContain("data-sidebar-collapsed");
      const stored = await request.get(RAIL_PAGE, { headers: { cookie: `${SIDEBAR_COOKIE}=collapsed` } });
      expect(stored.status()).toBe(200);
      expect(await stored.text()).toContain('data-sidebar-collapsed="true"');
      // Junk reads as expanded.
      expect(await (await request.get(RAIL_PAGE, { headers: { cookie: `${SIDEBAR_COOKIE}=maybe` } })).text()).not.toContain("data-sidebar-collapsed");

      await open(page, RAIL_PAGE);
      await collapseButton(page).click();
      await expectCollapsed(page, true);
      await page.reload();
      await expect(page.locator(HANDLE)).toBeVisible();
      await expectCollapsed(page, true);
      await page.goto(OTHER_PAGE);
      await expectCollapsed(page, true);
      // No flash: the collapsed attribute is in the document the server sent, not added by script.
      const html = await (await page.request.get(OTHER_PAGE)).text();
      expect(html).toContain('data-sidebar-collapsed="true"');

      await expandButton(page).click();
      await expectCollapsed(page, false);
      await page.reload();
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
    });

    test("R2 a stored collapsed cookie opens the first load collapsed with no click", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
      await open(page, RAIL_PAGE);
      await expectCollapsed(page, true);
      await expect(page.getByTestId("reader-nav-column")).toBeHidden();
    });

    test("F6 collapsed, Tab reaches the brand then Expand sidebar in the sidebar, and never a tree link", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
      await page.goto(RAIL_PAGE);
      await expectCollapsed(page, true);
      // PRECONDITION: the tree has links to reach, or the sweep proves nothing.
      expect(await page.locator('[data-testid="reader-nav-column"] a').count()).toBeGreaterThan(0);
      const seen: string[] = [];
      let treeLinkFocused = false;
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const at = await page.evaluate((sidebar) => {
          const el = document.activeElement;
          if (!el || !el.closest(sidebar)) return null;
          if (el.closest('[data-testid="reader-nav-column"]')) return "tree";
          if (el.getAttribute("data-testid") === "brand") return "brand";
          if (el.tagName === "BUTTON" && el.hasAttribute("aria-pressed")) return "toggle";
          return `other:${el.tagName}`;
        }, SIDEBAR);
        if (at === "tree") treeLinkFocused = true;
        if (at && !seen.includes(at)) seen.push(at); // first visits only: the sweep wraps round the document
      }
      expect(treeLinkFocused).toBe(false);
      expect(seen).toEqual(["brand", "toggle"]);
    });
  });

  test.describe("below the sidebar breakpoint", () => {
    test.use({ viewport: { width: 800, height: 900 } });

    test("R3 the drawer opens with focus on the brand and the close button, and there is no collapse button", async ({ page, context, baseURL }) => {
      // A stored collapsed choice must not shrink the drawer.
      await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
      await page.goto(RAIL_PAGE);
      await page.getByTestId("nav-toggle").click();
      await expect(page.getByTestId("nav-close")).toBeVisible();
      await expect(page.getByTestId("reader-nav-column")).toBeVisible();
      expect(
        await page.evaluate(() => {
          const a = document.activeElement;
          return { tag: a?.tagName, inBrand: !!a?.closest('[data-testid="reader-sidebar-brand"]'), isClose: a?.getAttribute("data-testid") === "nav-close" };
        }),
      ).toEqual({ tag: "A", inBrand: true, isClose: false });
      await expect(collapseButton(page)).toBeHidden();
      await expect(expandButton(page)).toBeHidden();
    });
  });

  test.describe("at 1600x900", () => {
    test.use({ viewport: { width: 1600, height: 900 } });

    test("R4 choosing A4 landscape by key collapses the sidebar by itself, the page is 277 mm and the side panel sits beside it", async ({ page, context }) => {
      await open(page, RAIL_PAGE);
      await expectCollapsed(page, false);
      await pageUpTo(page, context, "a4-landscape");
      await expectCollapsed(page, true);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
      await expect(page.getByTestId("toc-rail")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toBeHidden();
      const article = (await page.locator(CONTENT).boundingBox())!;
      const rail = (await page.getByTestId("reader-rail").boundingBox())!;
      expect(rail.x).toBeGreaterThanOrEqual(article.x + article.width - 1);
    });

    // R4b (round 2, operator ruling "Drag snaps to landscape"): by drag, past Full the pointer snaps to A4 landscape when it is within a
    // few px of it. Drive the pointer, not the grip: past Full the grip does not follow the pointer. Since round 5 the handle is
    // symmetric (the page and the side panel are centred together), so the article grows by twice the pointer's travel from the press.
    const TALL_PAGE = "/w/sample/guides/Long%20page.md";
    /** Presses on the grip and moves the pointer to where the article would be `toWidth` wide (width = start + 2 x travel); the button stays down. */
    async function pointerDrag(page: Page, toWidth: number, steps = 8) {
      const grip = page.locator(HANDLE);
      const g = (await grip.boundingBox())!;
      const startWidth = await width(page, CONTENT);
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      if (tall < 2 * 900) throw new Error(`PRECONDITION MISSING: the long page is ${tall}px tall, need more than 2 viewports`);
      const y = g.y + g.height / 2;
      const x0 = g.x + g.width / 2;
      await page.mouse.move(x0, y);
      await page.mouse.down();
      const x = x0 + (toWidth - startWidth) / 2;
      await page.mouse.move(x, y, { steps });
      return { x, y, x0, startWidth, pointerToGrip: () => gripGap(page, x) };
    }
    async function pointerTo(page: Page, drag: { x0: number; y: number; startWidth: number }, toWidth: number, steps = 6) {
      const x = drag.x0 + (toWidth - drag.startWidth) / 2;
      await page.mouse.move(x, drag.y, { steps });
      return x;
    }

    test("R4b a drag released within 8 px of A4 landscape (past Full) snaps to it and collapses the sidebar", async ({ page, context }, testInfo) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      await expectCollapsed(page, false);
      const moved = await pointerDrag(page, LANDSCAPE_PX - 5);
      testInfo.annotations.push({ type: "pointer-to-grip offset px (far end)", description: (await moved.pointerToGrip()).toFixed(1) });
      await expect(snappedGuides(page)).toHaveCount(2); // a marker on each side of the guide
      await expect(snappedGuides(page).first()).toHaveAttribute("data-guide", "a4-landscape");
      await expect(snappedGuides(page).last()).toHaveAttribute("data-guide", "a4-landscape");
      await expect(readout(page)).toHaveText(/^1047 px$/);
      await page.mouse.up();
      await expect.poll(() => cookie(context, WIDTH_COOKIE)).toBe("a4-landscape");
      await expectCollapsed(page, true);
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
    });

    test("R4b a drag released about halfway between Full and A4 landscape commits Full", async ({ page, context }) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      const fullPx = await liveFullPx(page);
      await pointerDrag(page, (fullPx + LANDSCAPE_PX) / 2);
      await expect(snappedGuides(page).first()).toHaveAttribute("data-guide", "full");
      await page.mouse.up();
      await expect.poll(() => cookie(context, WIDTH_COOKIE)).toBe("full");
      await expectCollapsed(page, false);
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - fullPx)).toBeLessThanOrEqual(1.5);
      expect(fullPx).toBeLessThan(LANDSCAPE_PX); // precondition: Full is narrower than A4 landscape here, so landscape is the farther guide
    });

    test("R4b a drag released at Full commits Full and leaves the sidebar expanded", async ({ page, context }) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      await pointerDrag(page, await liveFullPx(page));
      await expect(snappedGuides(page).first()).toHaveAttribute("data-guide", "full");
      await page.mouse.up();
      await expect.poll(() => cookie(context, WIDTH_COOKIE)).toBe("full");
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
    });

 
    // R4c (rulings "Collapse live while dragging" and "drop it over it"): the collapse is made during the drag, the cookie only on release.
    test("R4c reaching the A4 landscape snap collapses the sidebar during the drag (no cookie yet) and the article is 277 mm", async ({ page, context }, testInfo) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      await expectCollapsed(page, false);
      await pointerDrag(page, LANDSCAPE_PX);
      // Still dragging: no pointer-up yet.
      await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
      expect(await cookie(context, WIDTH_COOKIE)).toBeNull();
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
      await expect(readout(page)).toHaveText(/^1047 px$/);
      // The landscape chip is solid, never over the side panel.
      const rail = (await page.getByTestId("reader-rail").boundingBox())!;
      for (const el of [page.locator('[data-slot="width-handle-guide-label"][data-guide="a4-landscape"]'), readout(page)]) {
        if ((await el.count()) === 0) continue;
        expect(intersects((await el.first().boundingBox())!, rail)).toBe(false);
      }
      await page.screenshot({ path: testInfo.outputPath("r4c-mid-drag-landscape.png") });
      await page.mouse.up();
      await expect.poll(() => cookie(context, WIDTH_COOKIE)).toBe("a4-landscape");
      await expect.poll(() => cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");
    });

    test("R4c dragging back below Full before release re-expands a drag-made collapse, and the release commits no collapse", async ({ page, context }) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      const drag = await pointerDrag(page, LANDSCAPE_PX);
      await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
      // Back to where the press was: the drag re-anchored at the collapse, but the pointer at its start is far below Full on any anchor.
      await page.mouse.move(drag.x0, drag.y, { steps: 10 });
      await expect(page.locator(SHELL)).not.toHaveAttribute("data-sidebar-collapsed", /.*/);
      await page.mouse.up();
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
      expect(await cookie(context, WIDTH_COOKIE)).not.toBe("a4-landscape");
    });

    test("R4c a hand-collapsed sidebar stays collapsed when the drag goes back", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      await expectCollapsed(page, true);
      const drag = await pointerDrag(page, LANDSCAPE_PX);
      await expect(snappedGuides(page).first()).toHaveAttribute("data-guide", "a4-landscape");
      await pointerTo(page, drag, drag.startWidth + 60);
      await expect(page.locator(SHELL)).toHaveAttribute("data-sidebar-collapsed", "true");
      await page.mouse.up();
      await expectCollapsed(page, true);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");
    });

    test("R4c a release past the A4 landscape guide (the far end) commits landscape and stores the collapse", async ({ page, context }) => {
      await page.goto(TALL_PAGE);
      await expect(page.locator(HANDLE)).toBeVisible();
      const max = Number(await page.locator(HANDLE).getAttribute("aria-valuemax"));
      await pointerDrag(page, Math.max(LANDSCAPE_PX + 150, max)); // well past the guide, to the handle's far end
      await page.mouse.up();
      await expect.poll(() => cookie(context, WIDTH_COOKIE)).toBe("a4-landscape");
      await expect.poll(() => cookie(context, SIDEBAR_COOKIE)).toBe("collapsed");
      await expectCollapsed(page, true);
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
    });

    test("R4 F1 on a page with no side panel, choosing A4 landscape leaves the sidebar expanded (no panel room is needed)", async ({ page, context }) => {
      await open(page, NO_PANEL_PAGE);
      await expect(page.getByTestId("reader-rail")).toHaveCount(0); // precondition: no outline, no Properties, so no side panel
      await expectCollapsed(page, false);
      await pageUpTo(page, context, "a4-landscape");
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
      // Guard that the page really had the room: the slot holds A4 landscape on its own, with the sidebar still there.
      expect(await slotWidth(page)).toBeGreaterThanOrEqual(LANDSCAPE_PX);
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
    });

    test("R4 choosing Full or A4 portrait never collapses the sidebar", async ({ page, context }) => {
      await open(page, RAIL_PAGE);
      await pageUpTo(page, context, "a4-portrait");
      await pageUpTo(page, context, "full");
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
    });

    test("R5 with the sidebar expanded and no room, the side panel stays beside the article and the page narrows to the real room", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, WIDTH_COOKIE, "a4-landscape");
      await open(page, RAIL_PAGE);
      await expect(page.locator(SHELL)).not.toHaveAttribute("data-sidebar-collapsed", /.*/); // the shell only: the button is what R1 covers
      await expect(page.getByTestId("toc-rail")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toBeHidden();
      const article = (await page.locator(CONTENT).boundingBox())!;
      const rail = (await page.getByTestId("reader-rail").boundingBox())!;
      expect(article.width).toBeLessThan(LANDSCAPE_PX - 8);
      expect(rail.x).toBeGreaterThanOrEqual(article.x + article.width - 1);
      expect(rail.y).toBeLessThan(article.y + 200); // beside the article's head, not under its body
      // The handle's readout is the real width, which is the Full guide here.
      await expect(page.locator(HANDLE)).toBeVisible();
      await expect.poll(async () => Math.abs(Number(await page.locator(HANDLE).getAttribute("aria-valuenow")) - article.width)).toBeLessThanOrEqual(1.5);
    });

    test("R5 expanding the sidebar again after the auto-collapse keeps the panel beside a narrower page", async ({ page, context }) => {
      await open(page, RAIL_PAGE);
      await pageUpTo(page, context, "a4-landscape");
      await expectCollapsed(page, true);
      await expandButton(page).click();
      await expectCollapsed(page, false);
      await expect(page.getByTestId("toc-rail")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toBeHidden();
      await expect.poll(async () => width(page, CONTENT)).toBeLessThan(LANDSCAPE_PX - 8);
      expect(await cookie(context, WIDTH_COOKIE)).toBe("a4-landscape");
    });

    test("R6 the Full guide and the handle's maximum use the larger content area when collapsed", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, WIDTH_COOKIE, "full");
      await open(page, RAIL_PAGE);
      const delta = (await themePx(page, "--sidebar-w")) - (await themePx(page, "--sidebar-w-collapsed"));
      const fullExpanded = await width(page, CONTENT);
      const maxExpanded = Number(await page.locator(HANDLE).getAttribute("aria-valuemax"));
      await collapseButton(page).click();
      await expectCollapsed(page, true);
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - fullExpanded - delta)).toBeLessThanOrEqual(2);
      await expect.poll(async () => Math.abs(Number(await page.locator(HANDLE).getAttribute("aria-valuemax")) - maxExpanded - delta)).toBeLessThanOrEqual(2);
      expect(await width(page, CONTENT)).toBeGreaterThan(fullExpanded);
    });
  });

  test.describe("at 1920x1000", () => {
    test.use({ viewport: { width: 1920, height: 1000 } });

    test("R4 when A4 landscape and the side panel fit, choosing it leaves the sidebar expanded", async ({ page, context }) => {
      await open(page, RAIL_PAGE);
      await pageUpTo(page, context, "a4-landscape");
      await expectCollapsed(page, false);
      expect(await cookie(context, SIDEBAR_COOKIE)).toBeNull();
      await expect.poll(async () => Math.abs((await width(page, CONTENT)) - LANDSCAPE_PX)).toBeLessThanOrEqual(1.5);
    });
  });

  test.describe("at 1280x900", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("R5 A4 portrait with no room: the side panel stays beside the article and the page is narrower than 190 mm", async ({ page, context, baseURL }) => {
      await addCookie(context, baseURL, WIDTH_COOKIE, "a4-portrait");
      await open(page, RAIL_PAGE);
      await expect(page.locator(SHELL)).not.toHaveAttribute("data-sidebar-collapsed", /.*/); // the shell only: the button is what R1 covers
      await expect(page.getByTestId("toc-rail")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toBeHidden();
      const article = (await page.locator(CONTENT).boundingBox())!;
      const rail = (await page.getByTestId("reader-rail").boundingBox())!;
      expect(article.width).toBeLessThan(718.11 - 8);
      expect(rail.x).toBeGreaterThanOrEqual(article.x + article.width - 1);
      await expect.poll(async () => Math.abs(Number(await page.locator(HANDLE).getAttribute("aria-valuenow")) - article.width)).toBeLessThanOrEqual(1.5);
    });
  });

  // R4d (rulings "Centre it, grip follows" and "Accept, continue"): the grip stays under the pointer from Reading to Full, and no chip or
  // readout is ever drawn over the side panel. Every position comes from the live layout (Full is read, the pointer maps width = start + 2 x travel).
  for (const [vw, vh] of [
    [1440, 900],
    [1600, 900],
    [1920, 1000],
  ] as const) {
    for (const collapsed of [false, true]) {
      test.describe(`R4d at ${vw}x${vh}, sidebar ${collapsed ? "collapsed" : "expanded"}`, () => {
        test.use({ viewport: { width: vw, height: vh } });

        test("the grip stays within 4 px of the pointer from Reading to Full", async ({ page, context, baseURL }) => {
          if (collapsed) await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
          await page.goto("/w/sample/guides/Long%20page.md");
          await expect(page.locator(HANDLE)).toBeVisible();
          await expectCollapsed(page, collapsed);
          const g = (await page.locator(HANDLE).boundingBox())!;
          const fullPx = await liveFullPx(page);
          expect(fullPx).toBeGreaterThan((await width(page, CONTENT)) + 100); // PRECONDITION: a real run between Reading and Full
          const y = g.y + g.height / 2;
          const x0 = g.x + g.width / 2;
          await page.mouse.move(x0, y);
          await page.mouse.down();
          // Move the pointer in small fixed steps (6 px = 12 px of width under the 2x mapping, inside Full's 16 px snap window), whatever the handle's mapping, until the drag reaches Full; the grip must be under the
          // pointer at every step on the way (the readout reads the width, so the sweep ends when it says Full).
          let reachedFull = false;
          let steps = 0;
          for (let x = x0 + 6; steps < 240; x += 6, steps++) {
            await page.mouse.move(x, y);
            // Full snaps within a few px, so the step that reaches it may end a little past the grip (it stops at Full's edge): the sweep ends there.
            reachedFull = (await snappedGuides(page).count()) > 0 && (await snappedGuides(page).first().getAttribute("data-guide")) === "full";
            if (reachedFull) break;
            await expect.poll(async () => Math.abs(await gripGap(page, x)), { message: `pointer ${x.toFixed(0)}, step ${steps}` }).toBeLessThanOrEqual(4);
          }
          expect(reachedFull, "the sweep reached the Full guide").toBe(true);
          await page.mouse.up();
        });

        test("no guide chip or readout box intersects the side panel's box during the sweep to the far end", async ({ page, context, baseURL }) => {
          if (collapsed) await addCookie(context, baseURL, SIDEBAR_COOKIE, "collapsed");
          await page.goto("/w/sample/guides/Long%20page.md");
          await expect(page.locator(HANDLE)).toBeVisible();
          const g = (await page.locator(HANDLE).boundingBox())!;
          const startWidth = await width(page, CONTENT);
          const max = Number(await page.locator(HANDLE).getAttribute("aria-valuemax"));
          const y = g.y + g.height / 2;
          const x0 = g.x + g.width / 2;
          await page.mouse.move(x0, y);
          await page.mouse.down();
          let checked = 0;
          for (let i = 1; i <= 12; i++) {
            await page.mouse.move(x0 + ((max - startWidth) / 2) * (i / 12), y, { steps: 3 });
            await expect(readout(page)).toBeVisible();
            const rail = (await page.getByTestId("reader-rail").boundingBox())!;
            const boxes = [await readout(page).boundingBox(), ...(await page.locator('[data-slot="width-handle-guide-label"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON())))];
            for (const b of boxes) {
              if (!b || b.width === 0) continue;
              checked++;
              expect(intersects(b, rail), `step ${i}: box ${JSON.stringify(b)} over the rail ${JSON.stringify(rail)}`).toBe(false);
            }
          }
          expect(checked).toBeGreaterThan(12); // the sweep really saw chips as well as the readout
          await page.mouse.up();
        });
      });
    }
  }
});
