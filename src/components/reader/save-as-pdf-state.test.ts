import { describe, expect, it, vi } from "vitest";

import { isPdfPending, requestPdf, shouldShowPdfHint } from "./save-as-pdf-state";

const view = (state: "none" | "drawing" | "settled", key: string | null = state === "none" ? null : "A") => ({ state, key });

describe("isPdfPending (TC-480)", () => {
  it("is pending with diagrams and no view begun, or a view still drawing", () => {
    expect(isPdfPending(2, view("none"), "A")).toBe(true);
    expect(isPdfPending(1, view("drawing"), "A")).toBe(true);
  });
  it("is ready once this page's own view has settled", () => {
    expect(isPdfPending(2, view("settled"), "A")).toBe(false);
  });
  it("C1: a settled view that belongs to another page does not make this page ready (client navigation)", () => {
    // Page A drew and settled; the click-through to diagram page B renders B's count before B's view has begun.
    expect(isPdfPending(2, view("settled", "A"), "B")).toBe(true);
    // B's view begins (drawing), then settles for B.
    expect(isPdfPending(2, view("drawing", "B"), "B")).toBe(true);
    expect(isPdfPending(2, view("settled", "B"), "B")).toBe(false);
  });
  it("is never pending on a page with no diagram, whatever the view", () => {
    for (const v of [view("none"), view("drawing"), view("settled", "other")]) expect(isPdfPending(0, v, "A")).toBe(false);
  });
});

describe("requestPdf", () => {
  const deps = (v: ReturnType<typeof view>, ready: Promise<void> = Promise.resolve()) => ({
    getView: () => v,
    getReady: vi.fn(() => ready),
    print: vi.fn(),
  });

  it("ignores a click while pending: no print, the promise is not even read", async () => {
    const d = deps(view("none"));
    expect(await requestPdf(3, "A", d)).toBe(false);
    expect(d.print).not.toHaveBeenCalled();
    expect(d.getReady).not.toHaveBeenCalled();
  });
  it("C1: ignores a click when the settled view is the previous page's", async () => {
    const d = deps(view("settled", "A"));
    expect(await requestPdf(3, "B", d)).toBe(false);
    expect(d.print).not.toHaveBeenCalled();
  });
  it("prints exactly once per click when ready, after the ready promise read at click time settles", async () => {
    let settle!: () => void;
    const d = deps(view("settled"), new Promise<void>((r) => (settle = r)));
    const done = requestPdf(3, "A", d);
    await Promise.resolve();
    expect(d.print).not.toHaveBeenCalled();
    settle();
    expect(await done).toBe(true);
    expect(d.print).toHaveBeenCalledTimes(1);
    expect(d.getReady).toHaveBeenCalledTimes(1);
  });
  it("prints once on a page with no diagram, even with no view begun", async () => {
    const d = deps(view("none"));
    expect(await requestPdf(0, "", d)).toBe(true);
    expect(d.print).toHaveBeenCalledTimes(1);
  });
});

describe("shouldShowPdfHint (TC-485, OA-6)", () => {
  const AGENTS: Array<[string, string, boolean]> = [
    ["Chrome Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", false],
    ["Chrome macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", false],
    ["Chrome Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", false],
    ["Edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0", false],
    ["Opera", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0", false],
    ["Brave or Arc (looks like Chrome)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", false],
    ["Samsung Internet", "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36", false],
    ["Chromium", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/126.0.0.0 Chrome/126.0.0.0 Safari/537.36", false],
    ["Firefox desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0", true],
    ["Firefox Android", "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0", true],
    ["Safari macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", true],
    ["Safari iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", true],
    ["Chrome iOS (CriOS)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1", true],
    ["Firefox iOS (FxiOS)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/128.0 Mobile/15E148 Safari/605.1.15", true],
    ["Edge iOS (EdgiOS)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.0 Mobile/15E148 Safari/605.1.15", true],
    ["Chrome-looking UA on iPad", "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1", true],
    ["empty", "", true],
    ["garbage", "not a browser", true],
    ["Chrome word without a version", "Chrome", true],
  ];
  it.each(AGENTS)("%s", (_name, ua, show) => {
    expect(shouldShowPdfHint(ua)).toBe(show);
  });
});
