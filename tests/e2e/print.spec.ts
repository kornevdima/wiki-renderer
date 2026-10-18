// BUG-061 printing: verification contract rows R1-R5 (wiki/contracts/BUG-061-print-empty-page-contract.md). R6 is the operator's.
// Cause: in print `.wr-column` and `.wr-layout` stayed `display: grid` and Chromium paginated them with a trailing empty page.
// The PDF is Chromium's own (`page.pdf()`, A4, the app's `@page`), parsed here with node:zlib: no PDF dependency. Nothing writes to a
// wiki folder; the spacer a sweep appends lives in the page's DOM only.
import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const WITH_PROPERTIES = "/w/sample/guides/Print%20with%20properties.md"; // frontmatter, several printed pages
const WITHOUT_PROPERTIES = "/w/sample/guides/Print%20without%20properties.md"; // no frontmatter, several printed pages
const RAIL_PAGE = "/w/sample/guides/Wide%20page.md"; // frontmatter, short

// The empty last page shows when the content overflows a printed page by less than the Properties block is tall (measured on 7cbb5b0:
// a window about 96 px wide out of a printed page about 1048 px tall). A spacer swept in 48 px steps over one page height lands in
// that window whatever the fonts, so the check does not depend on one machine's line breaks.
const PAGE_PX = 1056;
const STEP_PX = 48;

type PdfPage = { hasContent: boolean };

/** Pages of a Chromium (Skia) PDF in order; a page "has content" when its inflated content stream holds a paint operator. */
function parsePdf(buf: Buffer): PdfPage[] {
  const text = buf.toString("latin1");
  const objects = new Map<number, string>();
  for (const m of text.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[2]);
  const pages = [...objects.values()].filter((o) => /\/Type\s*\/Page\b(?!s)/.test(o));
  return pages.map((page) => {
    const ref = /\/Contents\s+(\d+) 0 R/.exec(page);
    const obj = ref ? objects.get(Number(ref[1])) : undefined;
    if (!obj) return { hasContent: false };
    if (/\/Length\s+\d+ 0 R/.test(obj)) throw new Error("PRECONDITION MISSING: indirect /Length, the parser only reads Skia's direct lengths");
    const length = Number(/\/Length\s+(\d+)/.exec(obj)?.[1] ?? 0);
    let at = obj.indexOf("stream") + "stream".length;
    if (obj[at] === "\r") at++;
    if (obj[at] === "\n") at++;
    const raw = Buffer.from(obj.slice(at, at + length), "latin1");
    const stream = length === 0 ? "" : (/FlateDecode/.test(obj) ? inflateSync(raw) : raw).toString("latin1");
    return { hasContent: /(^|\s)(f\*?|S|B|Tj|TJ|Do|sh)(\s|$)/m.test(stream) };
  });
}

async function printPages(page: Page): Promise<PdfPage[]> {
  return parsePdf(await page.pdf({ format: "A4", preferCSSPageSize: true }));
}

/** Sets (or creates) a blank spacer at the end of the article, so the content ends `px` lower. */
async function setSpacer(page: Page, px: number): Promise<void> {
  await page.evaluate((h) => {
    let el = document.getElementById("print-spacer");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-spacer";
      document.querySelector('[data-testid="reader-content"]')?.append(el);
    }
    el.style.height = `${h}px`;
  }, px);
}

async function openReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("reader-content")).toBeVisible();
}

async function sweep(page: Page, path: string): Promise<string[]> {
  await openReady(page, path);
  const problems: string[] = [];
  for (let px = 0; px <= PAGE_PX; px += STEP_PX) {
    await setSpacer(page, px);
    const pages = await printPages(page);
    if (pages.length === 0) problems.push(`spacer ${px}px: PRECONDITION MISSING: the PDF parser found no pages`);
    else if (!pages.at(-1)?.hasContent) problems.push(`spacer ${px}px: empty last page (${pages.length} pages)`);
  }
  return problems;
}

/** Without Properties nothing follows the article, so a spacer would itself print as a blank page: drop trailing paragraphs instead. */
async function trimSweep(page: Page, path: string, steps: number): Promise<string[]> {
  await openReady(page, path);
  const problems: string[] = [];
  for (let k = 0; k <= steps; k++) {
    const pages = await printPages(page);
    if (pages.length === 0) problems.push(`${k} paragraphs dropped: PRECONDITION MISSING: the PDF parser found no pages`);
    else if (!pages.at(-1)?.hasContent) problems.push(`${k} paragraphs dropped: empty last page (${pages.length} pages)`);
    await page.evaluate(() => document.querySelector('[data-testid="reader-content"] > p:last-of-type')?.remove());
  }
  return problems;
}

async function token(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => {
    const probe = document.createElement("div");
    probe.style.height = `var(${n})`;
    document.body.append(probe);
    const px = parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return px;
  }, name);
}

test.describe("BUG-061 print", () => {
  test.describe.configure({ timeout: 120_000 });

  test("R1: a page with frontmatter prints with no empty last page", async ({ page }) => {
    // The sweep can only land in the empty-page window if the window (the Properties block's printed height) is wider than the step.
    await openReady(page, WITH_PROPERTIES);
    await page.emulateMedia({ media: "print" });
    const props = await page.getByTestId("frontmatter-panel").boundingBox();
    if (!props) throw new Error("PRECONDITION MISSING: Properties has no box");
    expect(props.height).toBeGreaterThanOrEqual(2 * STEP_PX);
    await page.emulateMedia({ media: null });
    expect(await sweep(page, WITH_PROPERTIES)).toEqual([]);
  });

  // Guard, not a bite: measured green on 7cbb5b0 too (without Properties the grid left no trailing page); it pins that the fix keeps it so.
  test("R5 guard: a page without frontmatter prints with no empty last page", async ({ page }) => {
    // Precondition: the fixture has no Properties block.
    await openReady(page, WITHOUT_PROPERTIES);
    if ((await page.getByTestId("frontmatter-panel").count()) !== 0) throw new Error("PRECONDITION MISSING: fixture must have no frontmatter");
    expect(await trimSweep(page, WITHOUT_PROPERTIES, 12)).toEqual([]);
  });

  test("R2: Properties prints after the article, open, and keeps break-inside: avoid", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(RAIL_PAGE);
    await page.emulateMedia({ media: "print" });
    const article = page.getByTestId("reader-content");
    const props = page.getByTestId("frontmatter-panel");
    await expect(props.locator("dl")).toBeVisible();
    const a = await article.boundingBox();
    const p = await props.boundingBox();
    if (!a || !p) throw new Error("PRECONDITION MISSING: article or Properties has no box");
    expect(p.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(await props.evaluate((el) => getComputedStyle(el).breakInside)).toBe("avoid");
  });

  test("R3: the article-to-Properties gap on paper is the grid's (space-32 plus the rail's space-24)", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(RAIL_PAGE);
    await page.emulateMedia({ media: "print" });
    const a = await page.getByTestId("reader-content").boundingBox();
    const p = await page.getByTestId("frontmatter-panel").boundingBox();
    if (!a || !p) throw new Error("PRECONDITION MISSING: article or Properties has no box");
    const expected = (await token(page, "--space-32")) + (await token(page, "--space-24"));
    expect(Math.abs(p.y - (a.y + a.height) - expected)).toBeLessThanOrEqual(1);
  });

  test("R3: the article starts at the top of the printed column", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(RAIL_PAGE);
    await page.emulateMedia({ media: "print" });
    const column = await page.getByTestId("reader-column").boundingBox();
    const a = await page.getByTestId("reader-content").boundingBox();
    if (!column || !a) throw new Error("PRECONDITION MISSING: column or article has no box");
    expect(Math.abs(a.y - column.y)).toBeLessThanOrEqual(1);
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`R4: screen layout at ${viewport.width}x${viewport.height} is still a grid`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(RAIL_PAGE);
      await expect(page.getByTestId("reader-content")).toBeVisible();
      for (const selector of [".wr-column", ".wr-layout"]) {
        expect(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).display)).toBe("grid");
      }
      if (viewport.width >= 1200) {
        const a = await page.getByTestId("reader-content").boundingBox();
        const r = await page.getByTestId("reader-rail").boundingBox();
        if (!a || !r) throw new Error("PRECONDITION MISSING: article or rail has no box");
        expect(r.x).toBeGreaterThanOrEqual(a.x + a.width);
      }
    });
  }
});

// US-284 (wiki/contracts/US-284-print-file-title-contract.md R1-R5): the h1 injected from the file name stem is left out of print;
// a frontmatter-title h1 and a body's own h1 still print. R6 (the env parse) is the unit test in src/lib/env.test.ts.
// R4 needs a second server started with WIKI_PRINT_FILE_TITLE=true, named by E2E_PRINT_FILE_TITLE_URL, e.g.
//   WIKI_PRINT_FILE_TITLE=true WIKI_DIRS="sample=tests/fixtures/sample-wiki,second=tests/fixtures/second-wiki" WIKI_RECHECK_MS=0 \
//     npx next dev --hostname 127.0.0.1 --port 3301
//   E2E_BASE_URL=http://127.0.0.1:3300 E2E_PRINT_FILE_TITLE_URL=http://127.0.0.1:3301 npx playwright test tests/e2e/print.spec.ts -g "US-284"
const NO_TITLE = "/w/sample/guides/Untitled%20file%20name.md"; // (a) no frontmatter title, no leading h1: h1 "Untitled file name" is injected
const FM_TITLE = "/w/sample/guides/Titled%20by%20frontmatter.md"; // (b) frontmatter title, no leading h1: h1 is injected from the title
const OWN_H1 = "/w/sample/guides/Own%20body%20heading.md"; // (c) the body starts with its own h1
const PRINT_FILE_TITLE_URL = process.env.E2E_PRINT_FILE_TITLE_URL;

async function readyAndHeading(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("reader-content")).toBeVisible();
  // A CSS locator: a `display: none` h1 leaves the accessibility tree, so a role locator could not find it to assert it hidden.
  return page.locator("h1");
}

test.describe("US-284 print file-name heading", () => {
  test("R1: the file-name h1 shows on screen and is not rendered in print", async ({ page }) => {
    const h1 = await readyAndHeading(page, NO_TITLE);
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Untitled file name");
    await expect(h1).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(h1).toBeHidden();
    expect(await h1.evaluate((el) => getComputedStyle(el).display)).toBe("none");
  });

  test("R2: a frontmatter-title h1 prints", async ({ page }) => {
    const h1 = await readyAndHeading(page, FM_TITLE);
    await page.emulateMedia({ media: "print" });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Frontmatter title page");
    await expect(h1).toBeVisible();
  });

  test("R3: the body's own h1 prints", async ({ page }) => {
    const h1 = await readyAndHeading(page, OWN_H1);
    await page.emulateMedia({ media: "print" });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Body own heading");
    await expect(h1).toBeVisible();
  });

  test("R4: with WIKI_PRINT_FILE_TITLE=true the file-name h1 prints", async ({ page }) => {
    test.skip(
      !PRINT_FILE_TITLE_URL,
      "E2E_PRINT_FILE_TITLE_URL not set: start a server with WIKI_PRINT_FILE_TITLE=true (see the comment above NO_TITLE) and point this variable at it",
    );
    const h1 = await readyAndHeading(page, `${PRINT_FILE_TITLE_URL}${NO_TITLE}`);
    await expect(h1).toHaveText("Untitled file name");
    await page.emulateMedia({ media: "print" });
    await expect(h1).toBeVisible();
  });

  // The meta line prints and nothing of the outline does (US-292: no list under the title; the top-bar button is print:hidden), whatever happens to the heading before them.
  for (const [name, path] of [["no title", NO_TITLE], ["frontmatter title", FM_TITLE], ["own h1", OWN_H1]] as const) {
    test(`R5: ${name}: the meta line prints, there is no outline under the title, and the outline button stays out of print`, async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 900 }); // below 1200 px the top-bar button shows, the rail's copy does not
      await readyAndHeading(page, path);
      await expect(page.getByTestId("page-meta")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toHaveCount(0);
      await expect(page.getByTestId("outline-trigger")).toBeVisible();
      await page.emulateMedia({ media: "print" });
      await expect(page.getByTestId("page-meta")).toBeVisible();
      await expect(page.getByTestId("toc-inline")).toHaveCount(0);
      await expect(page.getByTestId("outline-trigger")).toBeHidden();
    });
  }
});
