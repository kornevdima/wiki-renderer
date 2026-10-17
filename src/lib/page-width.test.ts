import { describe, expect, it } from "vitest";

import {
  PAGE_WIDTH_COOKIE,
  a4ContentPx,
  acceptMetrics,
  applyPageWidth,
  buildGuides,
  choiceFromHandle,
  choiceToPx,
  documentWidth,
  mmToPx,
  pageWidthValue,
  parsePageWidth,
  resetTakesFocus,
  serializePageWidthCookie,
  type PageWidthTarget,
} from "./page-width";

const LABELS = { reading: "Reading", a4Portrait: "A4 portrait", a4Landscape: "A4 landscape", full: "Full" };

describe("US-280 guide computation", () => {
  it("converts millimetres at 96 px per inch", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 6);
    expect(a4ContentPx("a4-portrait")).toBeCloseTo(718.11, 1);
    expect(a4ContentPx("a4-landscape")).toBeCloseTo(1046.93, 1);
  });

  it("builds Reading, A4 portrait, A4 landscape and Full, narrowest first, from the measured measure and room", () => {
    const guides = buildGuides(576, 1256, LABELS);
    expect(guides.map((g) => g.id)).toEqual(["reading", "a4-portrait", "a4-landscape", "full"]);
    expect(guides.map((g) => g.label)).toEqual(["Reading", "A4 portrait", "A4 landscape", "Full"]);
    expect(guides[0]!.px).toBe(576);
    expect(guides[3]!.px).toBe(1256);
    expect(guides.map((g) => g.px)).toEqual([...guides.map((g) => g.px)].sort((a, b) => a - b));
  });

  it("orders Full before A4 landscape when a rail narrows it", () => {
    expect(buildGuides(576, 932, LABELS).map((g) => g.id)).toEqual(["reading", "a4-portrait", "full", "a4-landscape"]);
  });

  it("maps a choice to a width", () => {
    expect(choiceToPx({ kind: "reading" }, 576, 1256)).toBe(576);
    expect(choiceToPx({ kind: "guide", id: "full" }, 576, 1256)).toBe(1256);
    expect(choiceToPx({ kind: "guide", id: "a4-landscape" }, 576, 1256)).toBeCloseTo(1046.93, 1);
    expect(choiceToPx({ kind: "free", px: 812 }, 576, 1256)).toBe(812);
  });
});

describe("US-280 cookie", () => {
  it("parses guide ids and whole pixel widths", () => {
    expect(parsePageWidth("a4-portrait")).toEqual({ kind: "guide", id: "a4-portrait" });
    expect(parsePageWidth("a4-landscape")).toEqual({ kind: "guide", id: "a4-landscape" });
    expect(parsePageWidth("full")).toEqual({ kind: "guide", id: "full" });
    expect(parsePageWidth("812")).toEqual({ kind: "free", px: 812 });
  });

  it("reads anything else as Reading", () => {
    for (const bad of [undefined, null, "", "reading", "A4-PORTRAIT", "a4", "812px", "81.5", "-800", "12", "99999", "20000", "0x400", " 800", "800 ", "NaN", "Infinity", '{"a":1}', "<script>", 812, {}]) {
      expect(parsePageWidth(bad), String(bad)).toEqual({ kind: "reading" });
    }
  });

  it("round-trips every stored choice", () => {
    for (const raw of ["a4-portrait", "a4-landscape", "full", "812", "320", "10000"]) {
      expect(pageWidthValue(parsePageWidth(raw))).toBe(raw);
    }
    expect(pageWidthValue({ kind: "reading" })).toBeNull();
    expect(pageWidthValue({ kind: "free", px: 811.6 })).toBe("812");
  });

  it("serialises a one-year, site-wide, SameSite=Lax cookie, with Secure on https", () => {
    expect(serializePageWidthCookie({ kind: "guide", id: "a4-landscape" }, false)).toBe(
      `${PAGE_WIDTH_COOKIE}=a4-landscape; Max-Age=31536000; Path=/; SameSite=Lax`,
    );
    expect(serializePageWidthCookie({ kind: "free", px: 800 }, true)).toBe(`${PAGE_WIDTH_COOKIE}=800; Max-Age=31536000; Path=/; SameSite=Lax; Secure`);
  });

  it("deletes the cookie for Reading", () => {
    expect(serializePageWidthCookie({ kind: "reading" }, false)).toBe(`${PAGE_WIDTH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`);
  });
});

describe("US-280 handle results", () => {
  it("turns a snapped guide into its choice and a free drag into a pixel width", () => {
    expect(choiceFromHandle(576, "reading")).toEqual({ kind: "reading" });
    expect(choiceFromHandle(680.3, "a4-portrait")).toEqual({ kind: "guide", id: "a4-portrait" });
    expect(choiceFromHandle(1256, "full")).toEqual({ kind: "guide", id: "full" });
    expect(choiceFromHandle(812.4, null)).toEqual({ kind: "free", px: 812 });
    expect(choiceFromHandle(100, null)).toEqual({ kind: "reading" });
    expect(choiceFromHandle(800, "unknown")).toEqual({ kind: "free", px: 800 });
  });
});

describe("US-280 free widths stop at Full", () => {
  it("holds a free drag above Full at Full, and leaves guides and narrower widths alone", () => {
    expect(choiceFromHandle(990, null, 948)).toEqual({ kind: "guide", id: "full" });
    expect(choiceFromHandle(948, null, 948)).toEqual({ kind: "guide", id: "full" });
    expect(choiceFromHandle(947.4, null, 948)).toEqual({ kind: "free", px: 947 });
    expect(choiceFromHandle(1009.1, "a4-landscape", 948)).toEqual({ kind: "guide", id: "a4-landscape" });
    expect(choiceFromHandle(2000, null)).toEqual({ kind: "free", px: 2000 });
  });
});

describe("US-280 document attributes", () => {
  it("renders nothing for Reading, the id and a two-decimal px for A4, the id alone for Full, `free` and whole px for a drag", () => {
    expect(documentWidth({ kind: "reading" })).toEqual({ attribute: undefined, px: undefined });
    expect(documentWidth({ kind: "guide", id: "a4-portrait" })).toEqual({ attribute: "a4-portrait", px: "718.11px" });
    expect(documentWidth({ kind: "guide", id: "a4-landscape" })).toEqual({ attribute: "a4-landscape", px: "1046.93px" });
    expect(documentWidth({ kind: "guide", id: "full" })).toEqual({ attribute: "full", px: undefined });
    expect(documentWidth({ kind: "free", px: 812 })).toEqual({ attribute: "free", px: "812px" });
  });

  it("applies and clears them on the root element", () => {
    const props = new Map<string, string>();
    const root: PageWidthTarget = {
      dataset: {},
      style: { setProperty: (n, v) => void props.set(n, v), removeProperty: (n) => (props.delete(n) ? "x" : "") },
    };
    applyPageWidth(root, { kind: "free", px: 900 });
    expect(root.dataset.pageWidth).toBe("free");
    expect(props.get("--wr-page-px")).toBe("900px");
    applyPageWidth(root, { kind: "guide", id: "full" });
    expect(root.dataset.pageWidth).toBe("full");
    expect(props.has("--wr-page-px")).toBe(false);
    applyPageWidth(root, { kind: "reading" });
    expect(root.dataset.pageWidth).toBeUndefined();
  });
});

describe("US-280 Reset focus", () => {
  it("moves focus to the handle for a keyboard activation only", () => {
    expect(resetTakesFocus(0)).toBe(true);
    expect(resetTakesFocus(1)).toBe(false);
    expect(resetTakesFocus(2)).toBe(false);
  });
});

describe("US-280 measuring", () => {
  it("accepts a measurement only on screen and only when it is sensible", () => {
    expect(acceptMetrics(false, 576, 1272)).toBe(true);
    expect(acceptMetrics(true, 576, 1272)).toBe(false);
    expect(acceptMetrics(false, 0, 1272)).toBe(false);
    expect(acceptMetrics(false, 576, 500)).toBe(false);
  });
});
