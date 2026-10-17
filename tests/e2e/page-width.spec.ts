// US-280 page width with A4 guides: verification contract rows R1-R10 (wiki/contracts/US-280-page-width-contract.md).
// The width is kept in the `wr-page-width` cookie (guide id or whole px; Reading = no cookie). Every test gets a fresh browser
// context, so each starts from Reading. Nothing here writes to a wiki folder.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const COOKIE = "wr-page-width";
const RAIL_PAGE = "/w/sample/guides/Wide%20page.md"; // frontmatter + three headings: Properties and "On this page" rail
const NO_RAIL_PAGE = "/w/second/Readme.md"; // no frontmatter, no headings: no rail

const HANDLE = '[role="separator"][aria-label="Page width"]';
const GUIDE = '[data-slot="width-handle-guide"]';

// Measured at 1600x1000 (builder): A4 portrait 190 mm = 718.11 px, A4 landscape 277 mm = 1046.93 px (10 mm print margins), Reading 36em = 576 px.
const READING_PX = 576;
const PORTRAIT_PX = 718.11;
const LANDSCAPE_PX = 1046.93;

test.use({ viewport: { width: 1600, height: 1000 } });

async function setWidthCookie(context: BrowserContext, baseURL: string | undefined, value: string): Promise<void> {
  await context.addCookies([{ name: COOKIE, value, url: baseURL ?? "http://127.0.0.1:3100" }]);
}

async function widthCookie(context: BrowserContext): Promise<string | null> {
  return (await context.cookies()).find((c) => c.name === COOKIE)?.value ?? null;
}

async function openReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(HANDLE)).toBeVisible();
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`PRECONDITION MISSING: no box for ${selector}`);
  return b;
}

async function articleWidth(page: Page): Promise<number> {
  return (await box(page, "[data-testid=\"reader-content\"]")).width;
}

// The handle is symmetric (US-281 round 5): the page and the side panel are centred together, so the article grows by twice the
// pointer's travel. Four guides, a marker on each side of each.
const GUIDES = 4;
const GUIDE_MARKERS = 2 * GUIDES;

/** Presses the handle and moves the pointer so the article is `toWidth` px wide (from its width at the press); the button stays down. */
async function dragTo(page: Page, toWidth: number): Promise<void> {
  const h = await box(page, HANDLE);
  const a = await box(page, "[data-testid=\"reader-content\"]");
  const y = h.y + h.height / 2;
  const x0 = h.x + h.width / 2;
  const x1 = x0 + (toWidth - a.width) / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1 - 10, y, { steps: 4 });
  await page.mouse.move(x1, y, { steps: 4 });
}

async function fontPx(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

// @axe-core/playwright types its Page against its own playwright-core copy, which differs in two members from ours.
function axe(page: Page): AxeBuilder {
  return new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] });
}

/** The @page rules in the document's style sheets: any with a `size`, any named page, and the unnamed rule's margin. */
async function pageRules(page: Page): Promise<{ sized: string[]; named: string[]; margin: string }> {
  return page.evaluate(() => {
    const out = { sized: [] as string[], named: [] as string[], margin: "" };
    const walk = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSPageRule) {
          if (r.style.getPropertyValue("size")) out.sized.push(`${r.selectorText}: ${r.style.getPropertyValue("size")}`);
          if (r.selectorText) out.named.push(r.selectorText);
          else if (r.style.getPropertyValue("margin") || r.style.getPropertyValue("margin-top")) out.margin = r.style.getPropertyValue("margin") || r.style.getPropertyValue("margin-top");
        } else if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // cross-origin sheet: not ours
      }
    }
    return out;
  });
}

/** Playwright's "A4" is 8.27 x 11.7 in, which Chromium writes as 596 x 843 pt; accept the real A4 within a point. */
function expectSheet(box: [number, number], expected: [number, number], message?: string): void {
  expect(Math.abs(box[0] - expected[0]), message).toBeLessThanOrEqual(1);
  expect(Math.abs(box[1] - expected[1]), message).toBeLessThanOrEqual(1);
}

function mediaBox(pdf: Buffer): [number, number] {
  const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"));
  if (!m) throw new Error("no MediaBox in the PDF");
  return [Math.round(Number(m[1])), Math.round(Number(m[2]))];
}

test.describe("US-280 page width", () => {
  test("R1 first visit: Reading column is the 36em measure and print sets no paper size, only a 10 mm margin", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReady(page, NO_RAIL_PAGE);
    // No stored width: the server renders no width attribute at all.
    await expect(page.locator("html")).not.toHaveAttribute("data-page-width", /.+/);
    const px = await page.locator("[data-testid=\"reader-content\"]").evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.width = "36em";
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return { w, article: el.getBoundingClientRect().width };
    });
    expect(px.article).toBeCloseTo(px.w, 0);
    expect(px.article).toBeCloseTo(READING_PX, 0);
    // The app sets no paper size: the print dialog (here: the requested format) decides.
    expect(await pageRules(page)).toEqual({ sized: [], named: [], margin: "10mm" });
    expectSheet(mediaBox(await page.pdf({ format: "A4", preferCSSPageSize: true })), [595, 842]);
  });

  test("R2 dragging snaps to Reading, A4 portrait, A4 landscape and Full, free between, guides hide on release", async ({ page, context }) => {
    await openReady(page, RAIL_PAGE);
    const handle = page.locator(HANDLE);
    // Guides and the readout are not shown at rest.
    await expect(page.locator(GUIDE)).toHaveCount(0);
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);

    // Symmetric (US-281 round 5: the page and the side panel are centred together): a marker on each side per guide, one set of labels.
    await dragTo(page, PORTRAIT_PX);
    await expect(page.locator('[data-slot="width-handle-guide"][data-side="start"]')).toHaveCount(GUIDES);
    await expect(page.locator('[data-slot="width-handle-guide"][data-side="end"]')).toHaveCount(GUIDES);
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    await expect(page.locator('[data-slot="width-handle-guide-label"]')).toHaveCount(GUIDES);
    await expect(page.locator('[data-slot="width-handle-readout"]')).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBe("a4-portrait");
    expect(await articleWidth(page)).toBeCloseTo(PORTRAIT_PX, 0);
    await expect(page.locator("html")).toHaveAttribute("data-page-width", "a4-portrait");
    // A pointer drag leaves focus on the handle (natively, no :focus-visible), without a ring, and guides and readout are gone.
    await expect(page.locator(GUIDE)).toHaveCount(0);
    await expect(page.locator('[data-slot="width-handle-readout"]')).toHaveCount(0);
    expect(await handle.evaluate((el) => ({ active: document.activeElement === el, outline: getComputedStyle(el).outlineStyle }))).toEqual({
      active: true,
      outline: "none",
    });

    await dragTo(page, LANDSCAPE_PX);
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBe("a4-landscape");
    expect(await articleWidth(page)).toBeCloseTo(LANDSCAPE_PX, 0);
    await expect(page.locator(GUIDE)).toHaveCount(0);
    // US-281: A4 landscape does not fit beside the expanded sidebar and the side panel, so choosing it collapsed the sidebar. Expand it
    // again, so the Full guide below is the expanded room (948), as before.
    await expect(page.locator('[data-testid="reader-shell"]')).toHaveAttribute("data-sidebar-collapsed", "true");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator('[data-testid="reader-shell"]')).not.toHaveAttribute("data-sidebar-collapsed", /.*/);

    // Free: between portrait and landscape and off every guide.
    await dragTo(page, 820);
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBe("820");
    expect(await articleWidth(page)).toBeCloseTo(820, 0);
    await expect(page.locator("html")).toHaveAttribute("data-page-width", "free");

    // Full, then Reading again.
    await dragTo(page, 948);
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBe("full");
    await dragTo(page, READING_PX);
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBeNull();
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);
  });

  for (const [id, px] of [
    ["reading", READING_PX],
    ["a4-portrait", PORTRAIT_PX],
    ["a4-landscape", LANDSCAPE_PX],
  ] as const) {
    test(`R2 the ${id} guide is marked snapped while dragging onto it`, async ({ page }) => {
      // 1920 wide: A4 landscape fits beside the sidebar and the side panel there (US-281 clamps the page where it does not).
      await page.setViewportSize({ width: 1920, height: 1080 });
      await openReady(page, RAIL_PAGE);
      if (id === "reading") {
        await dragTo(page, 800);
        await page.mouse.up();
      }
      await dragTo(page, px);
      // One marker on each side of the snapped guide (the handle is symmetric), and no other guide marked.
      await expect(page.locator(`${GUIDE}[data-guide="${id}"][data-snapped]`)).toHaveCount(2);
      await expect(page.locator(`${GUIDE}[data-snapped]`)).toHaveCount(2);
      await page.mouse.up();
    });
  }

  for (const [vw, vh] of [
    [1600, 1000],
    [1333, 900],
  ] as const) {
    test(`R2 every guide chip is fully inside the viewport while dragging at ${vw}x${vh}`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: vh });
      await openReady(page, RAIL_PAGE);
      await dragTo(page, 700);
      const chips = page.locator('[data-slot="width-handle-guide-label"]');
      // A guide that does not fit the room (max) is not offered at all; Full always is, with one chip per guide (markers on both sides).
      await expect(page.locator(`${GUIDE}[data-guide="full"]`)).toHaveCount(2);
      const n = await page.locator(`${GUIDE}[data-side="end"]`).count();
      expect(n).toBeGreaterThanOrEqual(3);
      await expect(chips).toHaveCount(n);
      for (let i = 0; i < n; i++) {
        const b = await chips.nth(i).boundingBox();
        expect(b, `chip ${i} has a box`).not.toBeNull();
        expect(b!.x).toBeGreaterThanOrEqual(0);
        expect(b!.y).toBeGreaterThanOrEqual(0);
        expect(b!.x + b!.width).toBeLessThanOrEqual(vw);
        expect(b!.y + b!.height).toBeLessThanOrEqual(vh);
      }
      await page.mouse.up();
    });
  }

  // A pointer click or drag focuses the grip natively WITHOUT :focus-visible: no ring, no guides or readout. The keyboard then works
  // (ArrowLeft/Right = 16 px), and from the first key the ring (:focus-visible, outline solid) and the guides are shown.
  async function expectRestWithFocus(page: Page): Promise<void> {
    const grip = page.locator(HANDLE);
    await expect(page.locator(GUIDE)).toHaveCount(0);
    await expect(page.locator('[data-slot="width-handle-readout"]')).toHaveCount(0);
    await expect(grip).toBeFocused();
    expect(await grip.evaluate((el) => ({ fv: el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle }))).toEqual({ fv: false, outline: "none" });
  }

  test("D2 after a pointer drag the grip keeps focus with its ring and no guides, and ArrowLeft then resizes by 16 px with the guides shown", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    await dragTo(page, 800);
    await page.mouse.up();
    await page.mouse.move(60, 600, { steps: 5 });
    await expectRestWithFocus(page);
    const before = Number(await grip.getAttribute("aria-valuenow"));
    expect(before).toBeCloseTo(800, 0);
    await page.keyboard.press("ArrowLeft");
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(before - 16, 0);
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    expect(await grip.evaluate((el) => ({ fv: el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle }))).toEqual({ fv: true, outline: "solid" });
  });

  test("D2 after a pointer click without moving the grip keeps focus with its ring and no guides, and ArrowRight then resizes by 16 px with the guides shown", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    const h = await box(page, HANDLE);
    await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.move(60, 600, { steps: 5 });
    await expectRestWithFocus(page);
    const before = Number(await grip.getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowRight");
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(before + 16, 0);
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    expect(await grip.evaluate((el) => ({ fv: el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle }))).toEqual({ fv: true, outline: "solid" });
  });

  /** A real drag from the grip: the bar goes active and all four guides show; then it is released. */
  async function expectActiveDrag(page: Page): Promise<void> {
    await dragTo(page, 760);
    await expect(page.locator('[data-slot="width-handle"]')).toHaveAttribute("data-active", "true");
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    await page.mouse.up();
    await page.mouse.move(60, 600, { steps: 3 });
    await expect(page.locator(GUIDE)).toHaveCount(0);
  }

  test("D1 print round-trip in one page: beforeprint, a 794 px viewport, afterprint, and the handle still works", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    const maxBefore = Number(await grip.getAttribute("aria-valuemax"));
    expect(maxBefore).toBeCloseTo(1272, -1);
    await dragTo(page, 800);
    await page.mouse.up();
    await page.mouse.move(60, 600, { steps: 3 });

    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

    await expect(grip).toBeVisible();
    await expect(grip).toHaveAttribute("aria-valuemax", String(maxBefore));
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(800, 0);
    await expectActiveDrag(page);
  });

  test("D1 page.pdf() in the middle (the print path), then the handle still drags", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    const maxBefore = Number(await grip.getAttribute("aria-valuemax"));
    await dragTo(page, 800);
    await page.mouse.up();
    await page.mouse.move(60, 600, { steps: 3 });
    await page.pdf({ format: "A4" });
    await expect(grip).toBeVisible();
    await expect(grip).toHaveAttribute("aria-valuemax", String(maxBefore));
    await expectActiveDrag(page);
  });

  test("R2 on a long page scrolled to the middle, guide segments are short and chips and readout stay inside the viewport", async ({ page }) => {
    await page.goto("/w/sample/guides/Long%20page.md");
    await expect(page.locator(HANDLE)).toBeVisible();
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    if (tall < 3 * 1000) throw new Error(`PRECONDITION MISSING: the long page is ${tall}px tall, need more than 3 viewports`);
    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await dragTo(page, 700);
    const markers = page.locator(GUIDE);
    const n = await markers.count() / 2; // a marker on each side of each guide
    expect(n).toBeGreaterThanOrEqual(3);
    const inside = (b: { x: number; y: number; width: number; height: number }) => {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1600);
      expect(b.y + b.height).toBeLessThanOrEqual(1000);
    };
    for (let i = 0; i < 2 * n; i++) {
      const b = (await markers.nth(i).boundingBox())!;
      expect(b.height, `guide ${i}`).toBeLessThanOrEqual(170);
      expect(b.height, `guide ${i}`).toBeGreaterThan(0);
    }
    const chips = page.locator('[data-slot="width-handle-guide-label"]');
    await expect(chips).toHaveCount(n);
    for (let i = 0; i < n; i++) inside((await chips.nth(i).boundingBox())!);
    inside((await page.locator('[data-slot="width-handle-readout"]').boundingBox())!);
    await page.mouse.up();
  });

  test("R2 the grip box is 176 px tall and centred in the sticky box; on a scrolled long page the ring box is inside the viewport and the readout sits just below", async ({ page }) => {
    await page.goto("/w/sample/guides/Long%20page.md");
    await expect(page.locator(HANDLE)).toBeVisible();
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    if (tall < 3 * 1000) throw new Error(`PRECONDITION MISSING: the long page is ${tall}px tall, need more than 3 viewports`);
    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await dragTo(page, 700);
    const grip = await box(page, HANDLE);
    const sticky = await box(page, ".wr-width-sticky");
    expect(Math.abs(grip.height - 176)).toBeLessThanOrEqual(2);
    expect(Math.abs(grip.y + grip.height / 2 - (sticky.y + sticky.height / 2))).toBeLessThanOrEqual(2);
    expect(grip.y).toBeGreaterThanOrEqual(0);
    expect(grip.y + grip.height).toBeLessThanOrEqual(1000);
    const readout = await box(page, '[data-slot="width-handle-readout"]');
    const gap = readout.y - (grip.y + grip.height);
    expect(gap).toBeGreaterThanOrEqual(-2);
    expect(gap).toBeLessThanOrEqual(40);
    await page.mouse.up();
  });

  test("R7 keyboard steps snap to a guide they reach: 704 -> A4 portrait 718 -> 734 free; Shift+ArrowLeft from 760 -> 718", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    await dragTo(page, 704);
    await page.mouse.up();
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(704, 0);
    await page.keyboard.press("ArrowRight");
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBe(718);
    await expect(grip).toHaveAttribute("aria-valuetext", /^.+, 718 px$/);
    await expect(page.locator(`${GUIDE}[data-guide="a4-portrait"][data-snapped]`)).toHaveCount(2);
    await page.keyboard.press("ArrowRight");
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBe(734);
    await expect(grip).toHaveAttribute("aria-valuetext", /^734 px$/);

    await dragTo(page, 760);
    await page.mouse.up();
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(760, 0);
    await page.keyboard.press("Shift+ArrowLeft");
    expect(Number(await grip.getAttribute("aria-valuenow"))).toBe(718);
  });

  test("R2 while dragging with the mouse the grip shows its drag box (outline solid) and the guides", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    await dragTo(page, 700);
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    expect(await page.locator(HANDLE).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.mouse.up();
  });

  test("R2 a blur and refocus after a mouse press shows no ring or guides", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const grip = page.locator(HANDLE);
    const h = await box(page, HANDLE);
    await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.move(60, 600, { steps: 3 });
    // A scripted blur()/focus() is the closest a headless run gets to the window regaining focus; it only counts if Chrome keeps
    // :focus-visible false for it, as it does after a mouse press.
    const fv = await grip.evaluate((el) => {
      (el as HTMLElement).blur();
      (el as HTMLElement).focus();
      return el.matches(":focus-visible");
    });
    test.skip(fv, "Chrome shows :focus-visible for a scripted refocus; a real window refocus cannot be driven headless");
    await expect(page.locator(GUIDE)).toHaveCount(0);
    expect(await grip.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  });

  test("R2 guides show on Tab focus and on a key press after a drag, never on pointer focus alone", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const handle = page.locator(HANDLE);
    // Tab to the handle.
    for (let i = 0; i < 80 && !(await handle.evaluate((el) => document.activeElement === el)); i++) await page.keyboard.press("Tab");
    expect(await handle.evaluate((el) => document.activeElement === el)).toBe(true);
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    expect(await handle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await expect(page.locator('[data-slot="width-handle-readout"]')).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 500 } });
    await expect(page.locator(GUIDE)).toHaveCount(0);

    // A drag leaves focus on the handle: a key press shows the guides again.
    await dragTo(page, PORTRAIT_PX);
    await page.mouse.up();
    await expect(page.locator(GUIDE)).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
  });

  test("R3 A4 guides: 190 mm / 277 mm columns and 11pt text", async ({ page, context, baseURL }) => {
    // 1920 wide: both sheets fit beside the sidebar and the side panel (where they do not, the page narrows: sidebar.spec.ts R5).
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const [value, px] of [
      ["a4-portrait", PORTRAIT_PX],
      ["a4-landscape", LANDSCAPE_PX],
    ] as const) {
      await setWidthCookie(context, baseURL, value);
      await openReady(page, RAIL_PAGE);
      const a = await box(page, "[data-testid=\"reader-content\"]");
      expect(Math.abs(a.width - px)).toBeLessThanOrEqual(1);
      expect(await fontPx(page, ".wr-prose p")).toBeCloseTo((11 * 96) / 72, 1);
      await expect(page.locator(".wr-rail")).toBeVisible();
      await expect(page.locator(".wr-rail .wr-properties").first()).toBeVisible();
    }
    // Not at A4: 16px text.
    await context.clearCookies();
    await openReady(page, RAIL_PAGE);
    expect(await fontPx(page, ".wr-prose p")).toBe(16);
  });

  // Operator ruling: on screen the rail stays beside the article at the A4 guides too. When A4 + the rail's room does not fit the
  // content slot the page narrows instead and the rail stays (US-281, "Panel stays, page narrows"; sidebar.spec.ts R5 measures it).
  for (const [vw, vh, value] of [
    [1600, 1000, "a4-portrait"],
    [1600, 1000, "a4-landscape"],
    [1920, 1080, "a4-landscape"],
    [1380, 900, "a4-portrait"],
    [1360, 900, "a4-portrait"],
  ] as const) {
    test(`R3 rail beside the article at ${value}, ${vw}x${vh}`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: vw, height: vh });
      await setWidthCookie(context, baseURL, value);
      await openReady(page, RAIL_PAGE);
      const a = await box(page, "[data-testid=\"reader-content\"]");
      const rail = await box(page, ".wr-rail");
      await expect(page.locator(".wr-rail .wr-properties").first()).toBeVisible();
      expect(rail.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
      await expect(page.locator(".wr-toc--inline").first()).toBeHidden();
    });
  }

  test("R3 in print the rail is in the flow, under the article, at an A4 guide", async ({ page, context, baseURL }) => {
    await setWidthCookie(context, baseURL, "a4-portrait");
    await openReady(page, RAIL_PAGE);
    await page.emulateMedia({ media: "print" });
    const a = await box(page, "[data-testid=\"reader-content\"]");
    const rail = await box(page, ".wr-rail");
    expect(rail.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
  });

  test("R3 Full and a free width keep the rail beside the article, the inline On this page stays hidden", async ({ page, context, baseURL }) => {
    for (const value of ["full", "820"]) {
      await setWidthCookie(context, baseURL, value);
      await openReady(page, RAIL_PAGE);
      const a = await box(page, "[data-testid=\"reader-content\"]");
      const rail = await box(page, ".wr-rail");
      expect(rail.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
      await expect(page.locator(".wr-toc--inline").first()).toBeHidden();
      expect(await fontPx(page, ".wr-prose p")).toBe(16);
      if (value === "full") expect(Math.abs(a.width - 948)).toBeLessThanOrEqual(3);
      else expect(Math.abs(a.width - 820)).toBeLessThanOrEqual(1);
    }
    // Reading as well.
    await context.clearCookies();
    await openReady(page, RAIL_PAGE);
    const a = await box(page, "[data-testid=\"reader-content\"]");
    expect((await box(page, ".wr-rail")).x).toBeGreaterThanOrEqual(a.x + a.width - 1);
    await expect(page.locator(".wr-toc--inline").first()).toBeHidden();
  });

  test("R3 a drag past Full clamps at Full and the handle stays on the article's edge", async ({ page, context }) => {
    await openReady(page, RAIL_PAGE);
    // Full on this layout, from the live slot and the side panel's room (not a hard-coded px).
    const fullPx = await page.evaluate(() => {
      const col = document.querySelector(".wr-column")!;
      const slot = col.parentElement!;
      const st = getComputedStyle(slot);
      return slot.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - col.querySelector<HTMLElement>("[data-width-extra-probe]")!.getBoundingClientRect().width;
    });
    // Just past Full, short of A4 landscape (the far end, which commits landscape: sidebar.spec.ts R4c): clamps at Full.
    await dragTo(page, fullPx + 20);
    await page.mouse.up();
    await expect.poll(() => widthCookie(context)).toBe("full");
    const a = await box(page, "[data-testid=\"reader-content\"]");
    const h = await box(page, HANDLE);
    expect(Math.abs(a.width - fullPx)).toBeLessThanOrEqual(3);
    expect(Math.abs(h.x + h.width / 2 - (a.x + a.width))).toBeLessThanOrEqual(2);
    const rail = await box(page, ".wr-rail");
    expect(rail.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
  });

  test("R4 print sets no paper size: the PDF follows the requested format and orientation at every stored choice", async ({ page, context, baseURL }) => {
    for (const value of [null, "full", "800", "a4-portrait", "a4-landscape"]) {
      await context.clearCookies();
      if (value) await setWidthCookie(context, baseURL, value);
      await openReady(page, RAIL_PAGE);
      expect(await pageRules(page), `cookie ${value}`).toEqual({ sized: [], named: [], margin: "10mm" });
      expectSheet(mediaBox(await page.pdf({ format: "A4", preferCSSPageSize: true })), [595, 842], `portrait, cookie ${value}`);
      expectSheet(mediaBox(await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true })), [842, 595], `landscape, cookie ${value}`);
    }
  });

  test("R4 below 1200 px the same holds: no CSS paper size, the requested format wins", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    for (const value of ["a4-landscape", "a4-portrait"]) {
      await context.clearCookies();
      await setWidthCookie(context, baseURL, value);
      await page.goto(RAIL_PAGE);
      await expect(page.getByTestId("reader-column")).toBeVisible();
      expectSheet(mediaBox(await page.pdf({ format: "A4", preferCSSPageSize: true })), [595, 842], `portrait, cookie ${value}`);
      expectSheet(mediaBox(await page.pdf({ format: "A4", landscape: true, preferCSSPageSize: true })), [842, 595], `landscape, cookie ${value}`);
    }
  });

  test("R4 the printed column is fluid: at an A4 guide it is the screen A4 width, with 11pt text", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // both sheets fit beside the sidebar and the side panel (US-281)
    for (const [value, px] of [
      ["a4-portrait", PORTRAIT_PX],
      ["a4-landscape", LANDSCAPE_PX],
    ] as const) {
      await context.clearCookies();
      await setWidthCookie(context, baseURL, value);
      await openReady(page, RAIL_PAGE);
      const screen = await articleWidth(page);
      expect(Math.abs(screen - px)).toBeLessThanOrEqual(1);
      // A viewport of the printable width, as the print layout sees it.
      await page.setViewportSize({ width: Math.round(px), height: 1000 });
      await page.emulateMedia({ media: "print" });
      expect(Math.abs((await articleWidth(page)) - screen)).toBeLessThanOrEqual(1);
      expect(await fontPx(page, ".wr-prose p")).toBeCloseTo((11 * 96) / 72, 1);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.emulateMedia({ media: "screen" });
    }
  });

  test("R5 after activating Reset with the keyboard, focus is on the handle", async ({ page, context, baseURL }) => {
    await setWidthCookie(context, baseURL, "a4-portrait");
    await openReady(page, RAIL_PAGE);
    const reset = page.getByTestId("page-width-reset");
    await reset.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => widthCookie(context)).toBeNull();
    await expect(page.locator(HANDLE)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });

  test("R5 a mouse click on Reset leaves no guides showing and does not move focus to the handle", async ({ page, context, baseURL }) => {
    await setWidthCookie(context, baseURL, "a4-portrait");
    await openReady(page, RAIL_PAGE);
    await page.getByTestId("page-width-reset").click();
    await expect.poll(() => widthCookie(context)).toBeNull();
    await expect(page.locator(GUIDE)).toHaveCount(0);
    await expect(page.locator('[data-slot="width-handle-readout"]')).toHaveCount(0);
    await expect(page.locator(HANDLE)).not.toBeFocused();
  });

  test("R5 the choice persists across pages, wikis and reload; Reset forgets it", async ({ page, context }) => {
    await openReady(page, RAIL_PAGE);
    const handle = page.locator(HANDLE);
    await handle.focus();
    await page.keyboard.press("PageUp"); // A4 portrait
    await page.keyboard.press("PageUp"); // Full (948 < 1047 on a rail page)
    await page.keyboard.press("PageUp"); // A4 landscape
    await expect.poll(() => widthCookie(context)).toBe("a4-landscape");
    await expect(page.getByTestId("page-width-reset")).toBeVisible();

    await page.reload();
    await expect(handle).toBeVisible();
    expect(await articleWidth(page)).toBeCloseTo(LANDSCAPE_PX, 0);

    await openReady(page, "/w/sample/guides/Getting%20started.md");
    expect(await articleWidth(page)).toBeCloseTo(LANDSCAPE_PX, 0);
    await openReady(page, NO_RAIL_PAGE); // another wiki
    expect(await articleWidth(page)).toBeCloseTo(LANDSCAPE_PX, 0);

    await page.getByTestId("page-width-reset").click();
    await expect.poll(() => widthCookie(context)).toBeNull();
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);
    await expect(page.getByTestId("page-width-reset")).toHaveCount(0);
    await page.reload();
    await expect(handle).toBeVisible();
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);
    await openReady(page, RAIL_PAGE);
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);
  });

  test("R6 no jump on load: the first HTML already carries the width and the layout does not shift", async ({ page, context, baseURL }) => {
    await setWidthCookie(context, baseURL, "a4-landscape");
    // The server's HTML names the width before any script runs.
    const html = await (await page.request.get(RAIL_PAGE)).text();
    expect(html).toMatch(/<html[^>]*data-page-width="a4-landscape"/);
    expect(html).toMatch(/<html[^>]*--wr-page-px/);

    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __early: number | null };
      w.__cls = 0;
      w.__early = null;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] }[]) {
          if (e.hadRecentInput) continue;
          // Only shifts of the article, its rail or the layout around them count; the page bar's toolbar also settles on hydration
          // at Reading, with no width stored (observed 0.0017), and is not the column.
          for (const s of e.sources) {
            const el = s.node instanceof Element ? s.node : s.node?.parentElement;
            if (el && (el.closest(".wr-layout") || el.querySelector(".wr-layout"))) w.__cls += e.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
      document.addEventListener("DOMContentLoaded", () => {
        const a = document.querySelector("[data-testid=\"reader-content\"]");
        w.__early = a ? a.getBoundingClientRect().width : null;
      });
    });
    await openReady(page, RAIL_PAGE);
    const { cls, early } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __early: number | null };
      return { cls: w.__cls, early: w.__early };
    });
    expect(early).not.toBeNull();
    expect(Math.abs((early as number) - (await articleWidth(page)))).toBeLessThanOrEqual(1);
    expect(cls).toBe(0);
  });

  test("R7 a guide is announced by name in aria-valuetext and the status region", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    const handle = page.getByRole("separator", { name: "Page width" });
    await handle.focus();
    await page.keyboard.press("PageUp"); // A4 portrait
    await expect(handle).toHaveAttribute("aria-valuetext", /^.+, \d+ px$/);
    await expect(page.locator('[data-slot="width-handle-status"]')).not.toBeEmpty();
    await page.keyboard.press("ArrowRight"); // off the guide
    await expect(handle).toHaveAttribute("aria-valuetext", /^\d+ px$/);
  });

  test("R7 axe: the handle itself is inside a landmark", async ({ page }) => {
    await openReady(page, RAIL_PAGE);
    await page.locator(HANDLE).focus();
    const results = await axe(page).analyze();
    const hits = results.violations.flatMap((v) => v.nodes.filter((n) => n.html.includes('role="separator"')).map((n) => `${v.id}: ${n.target.join(" ")}`));
    expect(hits).toEqual([]);
  });

  test("R7 keyboard: arrows resize, PageUp/PageDown jump guides, Home resets; named, announces width; axe clean", async ({ page, context }) => {
    await openReady(page, RAIL_PAGE);
    const handle = page.getByRole("separator", { name: "Page width" });
    await expect(handle).toBeVisible();
    await handle.focus();
    await expect(handle).toHaveAttribute("aria-orientation", "vertical");
    const num = async (attr: string) => Number(await handle.getAttribute(attr));
    expect(await num("aria-valuenow")).toBeCloseTo(READING_PX, 0);
    expect(await handle.getAttribute("aria-valuetext")).toBeTruthy();

    await page.keyboard.press("ArrowRight");
    const afterRight = await num("aria-valuenow");
    expect(afterRight).toBeGreaterThan(READING_PX);
    expect(await articleWidth(page)).toBeGreaterThan(READING_PX);
    await page.keyboard.press("ArrowLeft");
    expect(await num("aria-valuenow")).toBeLessThan(afterRight);

    await page.keyboard.press("PageUp");
    expect(await num("aria-valuenow")).toBeCloseTo(PORTRAIT_PX, 0);
    await expect(handle).toHaveAttribute("aria-valuetext", /\d+ px/);
    await page.keyboard.press("PageUp"); // Full: 948 on a rail page
    expect(await num("aria-valuenow")).toBeCloseTo(948, -1);
    await expect.poll(() => widthCookie(context)).toBe("full");
    await page.keyboard.press("PageUp");
    // The readout shows the real width: 948 until the auto-collapse (US-281) has made room, then the 277 mm page.
    await expect.poll(async () => Math.abs((await num("aria-valuenow")) - LANDSCAPE_PX)).toBeLessThan(0.5);
    await expect.poll(() => widthCookie(context)).toBe("a4-landscape");
    // US-281: A4 landscape did not fit, so it collapsed the sidebar, and Full is now wider than landscape: PageDown goes straight to portrait.
    await expect(page.locator('[data-testid="reader-shell"]')).toHaveAttribute("data-sidebar-collapsed", "true");
    await page.keyboard.press("PageDown");
    expect(await num("aria-valuenow")).toBeCloseTo(PORTRAIT_PX, 0);

    // Axe, with the handle focused and its guides showing.
    await expect(page.locator(GUIDE)).toHaveCount(GUIDE_MARKERS);
    // Page chrome that sits outside a landmark with or without the handle (same six nodes at 1024 px, where it is absent) is
    // excluded by selector; the `region` rule itself stays on, so the handle is checked against it.
    // The chips ease their colours (CSS transitions); axe reads mid-fade colours as low contrast, so let the transitions finish.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const results = await axe(page)
      .exclude(".gap-3 > .grid")
      .exclude(".py-4")
      .exclude(".border-t")
      .exclude('a[data-testid="source-view-link"]')
      .exclude('a[data-testid="edit-link"]')
      .exclude('span[data-testid="pdf-browser-hint"]')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

    await page.keyboard.press("Home");
    expect(await num("aria-valuenow")).toBeCloseTo(READING_PX, 0);
    await expect.poll(() => widthCookie(context)).toBeNull();
    expect(await articleWidth(page)).toBeCloseTo(READING_PX, 0);
  });

  test("R8 below 1200 px: no handle or reset, the column fits the window and ignores a stored width", async ({ page, context, baseURL }) => {
    await setWidthCookie(context, baseURL, "a4-landscape");
    for (const vp of [
      { width: 1024, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto(RAIL_PAGE);
      await expect(page.getByTestId("reader-column")).toBeVisible();
      await expect(page.locator(HANDLE)).toBeHidden();
      await expect(page.getByTestId("page-width-reset")).toBeHidden();
      const a = await box(page, "[data-testid=\"reader-content\"]");
      expect(a.width).toBeLessThanOrEqual(vp.width);
      expect(a.x + a.width).toBeLessThanOrEqual(vp.width + 1);
      expect(a.width).toBeLessThan(LANDSCAPE_PX - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(await fontPx(page, ".wr-prose p")).toBe(16);
    }
  });

  test("R9 CSP: no violations with the handle and the paint-before-hydrate width", async ({ page, context, baseURL }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      // `next dev` evaluates code (React's debug stacks) and the CSP refuses `eval`; the dev server is the instrument here, a
      // production build does not use eval. Every other violation counts.
      document.addEventListener("securitypolicyviolation", (e) => {
        if (e.blockedURI !== "eval") w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    const consoleCsp: string[] = [];
    page.on("console", (m) => {
      if (/content security policy/i.test(m.text()) && !/'unsafe-eval'|\beval\b/i.test(m.text())) consoleCsp.push(m.text());
    });
    page.on("pageerror", (e) => {
      if (/content security policy/i.test(e.message)) consoleCsp.push(e.message);
    });
    await setWidthCookie(context, baseURL, "a4-portrait");
    await openReady(page, RAIL_PAGE);
    await dragTo(page, LANDSCAPE_PX);
    await page.mouse.up();
    await page.keyboard.press("Home");
    await page.reload();
    await expect(page.locator(HANDLE)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(consoleCsp).toEqual([]);
  });
});
