import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPin, currentSection, getCurrentSection, getPinnedSection, getServerSection, isAtBottom, nextPin, noteScroll, PIN_SETTLE_MS, pinSection, resolveCurrent, setCurrentSection, subscribeSection } from "./section-spy-store";

describe("currentSection (US-219, E3-D4)", () => {
  const line = 240;
  it("is the last heading whose top is above the upper-third line", () => {
    expect(currentSection([-900, -300, 100, 500, 900], line, false)).toBe(2);
    expect(currentSection([-900, -300, 239, 240, 900], line, false)).toBe(2);
  });
  it("is the first heading while none has reached the line", () => {
    expect(currentSection([300, 700, 1200], line, false)).toBe(0);
  });
  it("is the last heading at the bottom of the page, even when it never reached the line", () => {
    expect(currentSection([-900, -300, 100, 500, 700], line, true)).toBe(4);
  });
  it("is -1 with no headings, at the bottom or not", () => {
    expect(currentSection([], line, false)).toBe(-1);
    expect(currentSection([], line, true)).toBe(-1);
  });
});

describe("isAtBottom", () => {
  it("is true at the end of a scrollable page, with a pixel of slack", () => {
    expect(isAtBottom({ scrollY: 1000, innerHeight: 800, scrollHeight: 1800 })).toBe(true);
    expect(isAtBottom({ scrollY: 998.5, innerHeight: 800, scrollHeight: 1800 })).toBe(true);
    expect(isAtBottom({ scrollY: 900, innerHeight: 800, scrollHeight: 1800 })).toBe(false);
  });
  it("is false for a page that fits the viewport and for non-finite input", () => {
    expect(isAtBottom({ scrollY: 0, innerHeight: 800, scrollHeight: 800 })).toBe(false);
    expect(isAtBottom({ scrollY: 0, innerHeight: 800, scrollHeight: 700 })).toBe(false);
    expect(isAtBottom({ scrollY: NaN, innerHeight: 800, scrollHeight: 1800 })).toBe(false);
  });
});

describe("the section store", () => {
  afterEach(() => setCurrentSection(null));
  it("notifies subscribers only on a change, and stops after unsubscribe", () => {
    let calls = 0;
    const off = subscribeSection(() => calls++);
    setCurrentSection("a");
    setCurrentSection("a");
    setCurrentSection("b");
    expect(calls).toBe(2);
    expect(getCurrentSection()).toBe("b");
    off();
    setCurrentSection("c");
    expect(calls).toBe(2);
  });
  it("reads null on the server", () => {
    expect(getServerSection()).toBeNull();
  });
});

describe("an explicit selection holds until the next scroll (US-219 fix round 1)", () => {
  const ids = ["s1", "s2", "s3", "s4"];
  const tops = [-900, -300, 100, 500]; // at the bottom of the page the last section never reached the line
  afterEach(() => {
    clearPin();
    setCurrentSection(null);
    vi.useRealTimers();
  });

  it("without a pin the page-bottom rule marks the last section", () => {
    expect(resolveCurrent(ids, tops, 240, true, null)).toBe("s4");
  });
  it("a pinned earlier short section beats the page-bottom rule and the upper-third rule", () => {
    expect(resolveCurrent(ids, tops, 240, true, "s3")).toBe("s3");
    expect(resolveCurrent(ids, tops, 240, false, "s2")).toBe("s2");
  });
  it("a pin for an id the list does not have is ignored", () => {
    expect(resolveCurrent(ids, tops, 240, true, "nope")).toBe("s4");
  });

  it("the reducer: the jump's own scrolls keep it settling, quiet arms it, the next scroll releases it", () => {
    const pin = { id: "s3", phase: "settling" as const };
    expect(nextPin(pin, "scroll")).toEqual(pin);
    expect(nextPin(pin, "settled")).toEqual({ id: "s3", phase: "armed" });
    expect(nextPin({ id: "s3", phase: "armed" }, "scroll")).toBeNull();
    expect(nextPin(null, "scroll")).toBeNull();
  });

  it("the store: scroll events from the jump do not release; after the settle window the next scroll does", () => {
    vi.useFakeTimers();
    pinSection("s3");
    expect(getCurrentSection()).toBe("s3");
    expect(noteScroll()).toBe(false);
    vi.advanceTimersByTime(PIN_SETTLE_MS - 1);
    expect(noteScroll()).toBe(false); // still the jump: restarts the window
    vi.advanceTimersByTime(PIN_SETTLE_MS - 1);
    expect(getPinnedSection()).toBe("s3");
    vi.advanceTimersByTime(2);
    expect(noteScroll()).toBe(true); // the reader's own scroll
    expect(getPinnedSection()).toBeNull();
    expect(noteScroll()).toBe(false);
  });
  it("a jump that causes no scroll arms after the window and the next scroll releases", () => {
    vi.useFakeTimers();
    pinSection("s2");
    vi.advanceTimersByTime(PIN_SETTLE_MS + 1);
    expect(noteScroll()).toBe(true);
  });
});
