import { a4ContentPx, choiceFromHandle, choiceToPx, type PageWidthChoice, type WidthGuide } from "@/lib/page-width";

/**
 * The reader's navigation sidebar state (US-281): collapsed to the 72 px strip, or expanded. Kept in a first-party `wr-sidebar`
 * cookie (per browser, all pages and wikis) that the root layout reads on the server, so the first HTML already has the right
 * layout (the same mechanism as `page-width.ts`). The value is `collapsed`; expanded is the default and is never stored (the cookie
 * is deleted). Pure: no `next/*` import, so vitest loads it.
 */
export const SIDEBAR_COOKIE = "wr-sidebar";

/** One year, in seconds. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The room the side panel takes beside the article, px: the gap `--space-60` (60) plus the column `--sidebar-w` (264). A test pins both against the theme. */
export const RAIL_ROOM_PX = 60 + 264;

/** True only for the exact stored value; anything else (missing, `expanded`, junk) is expanded. */
export function parseSidebarCollapsed(raw: unknown): boolean {
  return raw === "collapsed";
}

/** The `document.cookie` string: stores `collapsed`, or deletes the cookie for expanded. */
export function serializeSidebarCookie(collapsed: boolean, secure: boolean): string {
  const tail = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return collapsed ? `${SIDEBAR_COOKIE}=collapsed; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; ${tail}` : `${SIDEBAR_COOKIE}=; Max-Age=0; ${tail}`;
}

/**
 * Whether choosing `choice` should collapse the sidebar by itself: it is an A4 guide and the content area (`slotPx`, the slot's
 * width inside its padding) cannot hold the page plus the room the side panel really takes (`railRoomPx`: `RAIL_ROOM_PX` on a page
 * with a panel, 0 on one without). Reading, Full and a free width never do.
 */
export function shouldAutoCollapse(choice: PageWidthChoice, slotPx: number, railRoomPx: number, collapsed: boolean): boolean {
  if (collapsed || choice.kind !== "guide" || choice.id === "full") return false;
  return slotPx < a4ContentPx(choice.id) + railRoomPx;
}

/** The handle's readout for a choice: the width asked for, held to what the article can really be (`fullPx`, the room beside the panel). */
export function clampToRoom(px: number, fullPx: number): number {
  return Math.min(px, fullPx);
}

/**
 * What the handle shows as its value (US-281, "Drag snaps to landscape"). Normally the page's real width: the choice's width held to
 * the room beside the side panel. While a drag is snapped to an A4 guide (`snappedGuideId`), the guide's own width, even above the
 * room: releasing there commits that guide and the sidebar collapses to make the room.
 */
export function handleValue(choice: PageWidthChoice, readingPx: number, fullPx: number, snappedGuideId: string | null): number {
  if (snappedGuideId === "a4-portrait" || snappedGuideId === "a4-landscape") return a4ContentPx(snappedGuideId);
  return clampToRoom(choiceToPx(choice, readingPx, fullPx), fullPx);
}

/** How far the drag may go: the whole slot, or the farthest guide when that is wider, so every guide can be reached and snapped to. */
export function handleMax(maxPx: number, guides: readonly WidthGuide[]): number {
  return guides.reduce((far, g) => Math.max(far, g.px), maxPx);
}

/** The A4 guide a drag ends at when it is wider than Full (the far end of the drag): the widest A4 guide beyond `fullPx`, or null. */
export function farGuide(guides: readonly WidthGuide[], fullPx: number): WidthGuide | null {
  let far: WidthGuide | null = null;
  for (const g of guides) if ((g.id === "a4-portrait" || g.id === "a4-landscape") && g.px > fullPx && (far === null || g.px > far.px)) far = g;
  return far;
}

/**
 * The choice a drag position stands for (US-281, R4c). The handle's own snap (`guideId`) wins; otherwise a position at or past the far
 * A4 guide is that guide (not only within the snap zone: it is the end of the drag), and any other position beyond Full is Full.
 * `fullPx` is the room beside the side panel with the sidebar expanded, so a live collapse does not move the guide's ground.
 */
export function resolveWidth(px: number, guideId: string | null, fullPx: number, far: WidthGuide | null): PageWidthChoice {
  if (far !== null && guideId === null && px >= far.px) return { kind: "guide", id: far.id as "a4-portrait" | "a4-landscape" };
  return choiceFromHandle(px, guideId, fullPx);
}

/** The A4 guide id a choice stands for, or null. */
export function a4IdOf(choice: PageWidthChoice): "a4-portrait" | "a4-landscape" | null {
  return choice.kind === "guide" && choice.id !== "full" ? choice.id : null;
}
