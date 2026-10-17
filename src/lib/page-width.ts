/**
 * The reader's page width (US-280): how wide the article column is, and which A4 sheet print follows. Kept in a first-party
 * `wr-page-width` cookie (per browser, all pages and wikis) that the root layout reads on the server, so the first byte of HTML
 * already carries the width and the column never jumps on load (the same mechanism as the theme, `src/lib/theme.ts`). Pure: no
 * `next/*` import, so vitest loads it, and the DOM helpers take their targets as arguments.
 *
 * The cookie value is a guide id (`a4-portrait`, `a4-landscape`, `full`) or a whole number of pixels (a free width). `reading`
 * is the default and is never stored: choosing it deletes the cookie. Anything else is read as Reading.
 */
export const PAGE_WIDTH_COOKIE = "wr-page-width";

/** One year, in seconds. */
export const PAGE_WIDTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The viewport width from which the handle is offered; the same breakpoint as the rail in `wr-reader.css`. */
export const PAGE_WIDTH_BREAKPOINT_PX = 1200;

/** CSS pixels per inch and millimetres per inch: a CSS `mm` is `96 / 25.4` px. */
export const MM_TO_PX = 96 / 25.4;

/** The print margin on every side, mm. `wr-reader.css` writes the same `10mm` in its `@page` rules (pinned by a test). */
export const PRINT_MARGIN_MM = 10;

/** The A4 sheet, mm. */
export const A4_SHORT_MM = 210;
export const A4_LONG_MM = 297;

/** The ids the handle's guides carry. */
export const READING_ID = "reading";
export type A4GuideId = "a4-portrait" | "a4-landscape";
export type GuideChoiceId = A4GuideId | "full";
export type GuideId = typeof READING_ID | GuideChoiceId;

export type PageWidthChoice =
  | { kind: "reading" }
  | { kind: "guide"; id: GuideChoiceId }
  | { kind: "free"; px: number };

export const READING: PageWidthChoice = { kind: "reading" };

/** The smallest and largest free width a cookie may hold; anything outside is read as Reading. */
export const FREE_MIN_PX = 320;
export const FREE_MAX_PX = 10000;

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

/** The printable width of an A4 sheet at the print margins, px (portrait about 718, landscape about 1047). */
export function a4ContentPx(id: A4GuideId): number {
  const sheet = id === "a4-portrait" ? A4_SHORT_MM : A4_LONG_MM;
  return mmToPx(sheet - 2 * PRINT_MARGIN_MM);
}

export interface WidthGuide {
  id: string;
  label: string;
  px: number;
}

export interface GuideLabels {
  reading: string;
  a4Portrait: string;
  a4Landscape: string;
  full: string;
}

/** The four guides, narrowest first. `readingPx` is the measure as the browser computed it; `fullPx` the article's widest width with the rail beside it. */
export function buildGuides(readingPx: number, fullPx: number, labels: GuideLabels): WidthGuide[] {
  return [
    { id: READING_ID, label: labels.reading, px: readingPx },
    { id: "a4-portrait", label: labels.a4Portrait, px: a4ContentPx("a4-portrait") },
    { id: "a4-landscape", label: labels.a4Landscape, px: a4ContentPx("a4-landscape") },
    { id: "full", label: labels.full, px: fullPx },
  ].sort((a, b) => a.px - b.px);
}

/** The stored value to a choice. A missing, unknown, fractional-junk or out-of-range value is Reading. */
export function parsePageWidth(raw: unknown): PageWidthChoice {
  if (typeof raw !== "string") return READING;
  if (raw === "a4-portrait" || raw === "a4-landscape" || raw === "full") return { kind: "guide", id: raw };
  if (/^[0-9]{3,5}$/.test(raw)) {
    const px = Number(raw);
    if (px >= FREE_MIN_PX && px <= FREE_MAX_PX) return { kind: "free", px };
  }
  return READING;
}

/** The choice the handle reports (a width and the guide it snapped to, or none) as a stored choice; a free width is held to `fullPx`. */
export function choiceFromHandle(px: number, guideId: string | null, fullPx: number = Infinity): PageWidthChoice {
  if (guideId === READING_ID) return READING;
  if (guideId === "a4-portrait" || guideId === "a4-landscape" || guideId === "full") return { kind: "guide", id: guideId };
  // A free width never exceeds Full: with a rail beside the article, Full is as wide as the article can really be, so the handle
  // stops there; an A4 guide beyond it is reached only by snapping or by key.
  if (px >= fullPx) return { kind: "guide", id: "full" };
  const rounded = Math.round(px);
  return rounded >= FREE_MIN_PX && rounded <= FREE_MAX_PX ? { kind: "free", px: rounded } : READING;
}

/** The cookie value for a choice, or `null` for Reading (nothing is stored). */
export function pageWidthValue(choice: PageWidthChoice): string | null {
  if (choice.kind === "guide") return choice.id;
  if (choice.kind === "free") return String(Math.round(choice.px));
  return null;
}

/** The `document.cookie` string: sets the choice, or deletes the cookie for Reading. */
export function serializePageWidthCookie(choice: PageWidthChoice, secure: boolean): string {
  const value = pageWidthValue(choice);
  const tail = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return value === null
    ? `${PAGE_WIDTH_COOKIE}=; Max-Age=0; ${tail}`
    : `${PAGE_WIDTH_COOKIE}=${value}; Max-Age=${PAGE_WIDTH_COOKIE_MAX_AGE}; ${tail}`;
}

/** The column's width in px for a choice, given the measure and the room; `full` is the room. */
export function choiceToPx(choice: PageWidthChoice, readingPx: number, fullPx: number): number {
  if (choice.kind === "reading") return readingPx;
  if (choice.kind === "free") return choice.px;
  if (choice.id === "full") return fullPx;
  return a4ContentPx(choice.id);
}

/**
 * What the document carries for a choice: `data-page-width` (the guide id, or `free`; none for Reading) and the
 * `--wr-page-px` custom property (set for an A4 guide and a free width; Full is the CSS `100%`). Two decimals, so a
 * server render and a client apply print the same string.
 */
export function documentWidth(choice: PageWidthChoice): { attribute: string | undefined; px: string | undefined } {
  if (choice.kind === "reading") return { attribute: undefined, px: undefined };
  if (choice.kind === "free") return { attribute: "free", px: `${Math.round(choice.px)}px` };
  if (choice.id === "full") return { attribute: "full", px: undefined };
  return { attribute: choice.id, px: `${a4ContentPx(choice.id).toFixed(2)}px` };
}

/** The slice of the root element the apply needs, so a unit test can hand in a fake. */
export interface PageWidthTarget {
  dataset: DOMStringMap;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
}

/** Puts a choice on the open page at once (attribute and custom property, set through the CSSOM, which the CSP allows). */
export function applyPageWidth(root: PageWidthTarget, choice: PageWidthChoice): void {
  const { attribute, px } = documentWidth(choice);
  if (attribute === undefined) delete root.dataset.pageWidth;
  else root.dataset.pageWidth = attribute;
  if (px === undefined) root.style.removeProperty("--wr-page-px");
  else root.style.setProperty("--wr-page-px", px);
}

/** Reset hands focus to the handle only when it was activated from the keyboard (a click event's `detail` is 0 then), never for a mouse click. */
export function resetTakesFocus(clickDetail: number): boolean {
  return clickDetail === 0;
}

/** Whether a measurement may replace the handle's metrics: never while printing (the probes are display:none, 0 px), and never a zero or nonsensical one. */
export function acceptMetrics(printing: boolean, readingPx: number, fullPx: number): boolean {
  return !printing && readingPx > 0 && fullPx >= readingPx;
}
