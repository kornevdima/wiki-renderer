import { describe, expect, it } from "vitest";

import { a4ContentPx } from "@/lib/page-width";
import { a4IdOf, clampToRoom, farGuide, resolveWidth, handleMax, handleValue, parseSidebarCollapsed, RAIL_ROOM_PX, serializeSidebarCookie, shouldAutoCollapse, SIDEBAR_COOKIE } from "@/lib/sidebar";

describe("the sidebar cookie (US-281)", () => {
  it("reads only the exact stored value as collapsed", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    for (const raw of [undefined, null, "", "expanded", "Collapsed", "true", 1]) expect(parseSidebarCollapsed(raw)).toBe(false);
  });

  it("stores collapsed for a year and deletes the cookie for expanded", () => {
    expect(serializeSidebarCookie(true, false)).toBe(`${SIDEBAR_COOKIE}=collapsed; Max-Age=31536000; Path=/; SameSite=Lax`);
    expect(serializeSidebarCookie(true, true)).toMatch(/; Secure$/);
    expect(serializeSidebarCookie(false, false)).toBe(`${SIDEBAR_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`);
  });
});

describe("the A4 auto-collapse (US-281)", () => {
  const landscape = { kind: "guide", id: "a4-landscape" } as const;
  const portrait = { kind: "guide", id: "a4-portrait" } as const;

  it("collapses when the page plus the side panel does not fit", () => {
    expect(shouldAutoCollapse(landscape, a4ContentPx("a4-landscape") + RAIL_ROOM_PX - 1, RAIL_ROOM_PX, false)).toBe(true);
    expect(shouldAutoCollapse(portrait, a4ContentPx("a4-portrait") + RAIL_ROOM_PX - 1, RAIL_ROOM_PX, false)).toBe(true);
  });

  it("on a page with no side panel, collapses only when A4 itself does not fit", () => {
    const landscapePx = a4ContentPx("a4-landscape");
    expect(shouldAutoCollapse(landscape, landscapePx + 10, 0, false)).toBe(false);
    expect(shouldAutoCollapse(landscape, landscapePx - 1, 0, false)).toBe(true);
    expect(shouldAutoCollapse(landscape, landscapePx + 10, RAIL_ROOM_PX, false)).toBe(true);
  });

  it("does not collapse when it fits, or when already collapsed", () => {
    expect(shouldAutoCollapse(landscape, a4ContentPx("a4-landscape") + RAIL_ROOM_PX, RAIL_ROOM_PX, false)).toBe(false);
    expect(shouldAutoCollapse(landscape, 100, RAIL_ROOM_PX, true)).toBe(false);
  });

  it("never collapses for Reading, Full or a free width", () => {
    expect(shouldAutoCollapse({ kind: "reading" }, 100, RAIL_ROOM_PX, false)).toBe(false);
    expect(shouldAutoCollapse({ kind: "guide", id: "full" }, 100, RAIL_ROOM_PX, false)).toBe(false);
    expect(shouldAutoCollapse({ kind: "free", px: 900 }, 100, RAIL_ROOM_PX, false)).toBe(false);
  });

  it("holds the readout to the room", () => {
    expect(clampToRoom(1047, 800)).toBe(800);
    expect(clampToRoom(700, 800)).toBe(700);
  });
});

describe("the handle's value and reach (US-281, drag snaps to landscape)", () => {
  const full = { kind: "guide", id: "full" } as const;
  it("shows the real, clamped width when nothing is snapped", () => {
    expect(handleValue({ kind: "guide", id: "a4-landscape" }, 576, 948, null)).toBe(948);
    expect(handleValue(full, 576, 948, null)).toBe(948);
    expect(handleValue({ kind: "reading" }, 576, 948, null)).toBe(576);
  });
  it("shows the snapped A4 guide's width even above the room", () => {
    expect(handleValue(full, 576, 948, "a4-landscape")).toBeCloseTo(a4ContentPx("a4-landscape"), 5);
    expect(handleValue(full, 576, 948, "a4-portrait")).toBeCloseTo(a4ContentPx("a4-portrait"), 5);
  });
  it("ignores a snapped Full or Reading guide (the clamp already gives them)", () => {
    expect(handleValue(full, 576, 948, "full")).toBe(948);
    expect(handleValue({ kind: "reading" }, 576, 948, "reading")).toBe(576);
  });
  it("reaches the farthest guide when the slot is narrower than it", () => {
    const guides = [{ id: "a4-landscape", label: "L", px: 1047 }, { id: "full", label: "F", px: 700 }];
    expect(handleMax(900, guides)).toBe(1047);
    expect(handleMax(1272, guides)).toBe(1272);
  });
});

describe("the far end of the drag (US-281, R4c)", () => {
  const guides = [
    { id: "reading", label: "R", px: 576 },
    { id: "a4-portrait", label: "P", px: 718 },
    { id: "full", label: "F", px: 948 },
    { id: "a4-landscape", label: "L", px: 1047 },
  ];
  it("is the widest A4 guide beyond Full, or none", () => {
    expect(farGuide(guides, 948)?.id).toBe("a4-landscape");
    expect(farGuide(guides, 1100)).toBeNull();
    expect(farGuide(guides, 600)?.id).toBe("a4-landscape");
  });
  it("commits the far guide at or past it, not only in the snap zone", () => {
    const far = farGuide(guides, 948);
    expect(resolveWidth(1047, null, 948, far)).toEqual({ kind: "guide", id: "a4-landscape" });
    expect(resolveWidth(1200, null, 948, far)).toEqual({ kind: "guide", id: "a4-landscape" });
    expect(resolveWidth(1040, "a4-landscape", 948, far)).toEqual({ kind: "guide", id: "a4-landscape" });
  });
  it("resolves between Full and the far guide to Full", () => {
    const far = farGuide(guides, 948);
    expect(resolveWidth(1000, null, 948, far)).toEqual({ kind: "guide", id: "full" });
    expect(resolveWidth(948, "full", 948, far)).toEqual({ kind: "guide", id: "full" });
  });
  it("leaves narrower widths to the handle's own resolve", () => {
    const far = farGuide(guides, 948);
    expect(resolveWidth(800, null, 948, far)).toEqual({ kind: "free", px: 800 });
    expect(resolveWidth(718, "a4-portrait", 948, far)).toEqual({ kind: "guide", id: "a4-portrait" });
    expect(resolveWidth(1200, null, 1500, null)).toEqual({ kind: "free", px: 1200 });
  });
  it("names the A4 guide of a choice", () => {
    expect(a4IdOf({ kind: "guide", id: "a4-landscape" })).toBe("a4-landscape");
    expect(a4IdOf({ kind: "guide", id: "full" })).toBeNull();
    expect(a4IdOf({ kind: "reading" })).toBeNull();
  });
});
