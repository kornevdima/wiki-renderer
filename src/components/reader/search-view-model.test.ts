import { describe, expect, it } from "vitest";

import { formatResultCount, isApplePlatform, isModifiedClick, isSearchShortcut, OPEN_POPUP_SELECTOR, searchViewState, shouldOpenOnShortcut, splitEmptyTitle } from "./search-view-model";

describe("searchViewState (D3, D4; TC-228, TC-476)", () => {
  it("failed beats everything, loading beats the query", () => {
    expect(searchViewState({ phase: "failed", query: "x", rowCount: 3 })).toBe("failed");
    expect(searchViewState({ phase: "loading", query: "", rowCount: 0 })).toBe("loading");
  });
  it("empty and whitespace-only queries are idle, never the no-match state", () => {
    expect(searchViewState({ phase: "ready", query: "", rowCount: 0 })).toBe("idle");
    expect(searchViewState({ phase: "ready", query: "   ", rowCount: 0 })).toBe("idle");
  });
  it("a real query is empty or results by row count", () => {
    expect(searchViewState({ phase: "ready", query: "q", rowCount: 0 })).toBe("empty");
    expect(searchViewState({ phase: "ready", query: "q", rowCount: 2 })).toBe("results");
  });
});

describe("formatResultCount", () => {
  const copy = { one: "1 result", other: "{count} results" };
  it("singular for one, substituted plural otherwise", () => {
    expect(formatResultCount(copy, 1)).toBe("1 result");
    expect(formatResultCount(copy, 20)).toBe("20 results");
    expect(formatResultCount(copy, 2)).toBe("2 results");
  });
});

describe("isModifiedClick", () => {
  const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  it("a plain primary click is not modified; any modifier or other button is", () => {
    expect(isModifiedClick(base)).toBe(false);
    expect(isModifiedClick({ ...base, ctrlKey: true })).toBe(true);
    expect(isModifiedClick({ ...base, metaKey: true })).toBe(true);
    expect(isModifiedClick({ ...base, button: 1 })).toBe(true);
  });
});

describe("isSearchShortcut (US-222, TC-516)", () => {
  const key = (over: Partial<Parameters<typeof isSearchShortcut>[0]> = {}) => ({ key: "k", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, ...over });
  it("Ctrl+K and Cmd+K fire, and Caps Lock's capital K too", () => {
    expect(isSearchShortcut(key())).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: "K" }))).toBe(true);
  });
  it("added modifiers, another key and a bare K do not fire", () => {
    expect(isSearchShortcut(key({ shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: "j" }))).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: false }))).toBe(false);
    expect(isSearchShortcut(key({ key: "" }))).toBe(false);
  });
});

describe("shouldOpenOnShortcut (US-222, TC-516)", () => {
  const ev = { key: "k", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false };
  it("opens only when neither the dialog nor the drawer is open", () => {
    expect(shouldOpenOnShortcut(ev, { dialogOpen: false, drawerOpen: false })).toBe(true);
    expect(shouldOpenOnShortcut(ev, { dialogOpen: true, drawerOpen: false })).toBe(false);
    expect(shouldOpenOnShortcut(ev, { dialogOpen: false, drawerOpen: true })).toBe(false);
  });
  it("is ignored when another handler prevented the key, or a menu or select is open", () => {
    const idle = { dialogOpen: false, drawerOpen: false };
    expect(shouldOpenOnShortcut({ ...ev, defaultPrevented: true }, idle)).toBe(false);
    expect(shouldOpenOnShortcut(ev, { ...idle, popupOpen: true })).toBe(false);
    expect(shouldOpenOnShortcut({ ...ev, defaultPrevented: false }, { ...idle, popupOpen: false })).toBe(true);
  });
  it("the popup selector names an open Radix menu or select list only", () => {
    expect(OPEN_POPUP_SELECTOR).toContain('[role="menu"][data-state="open"]');
    expect(OPEN_POPUP_SELECTOR).toContain('[role="listbox"][data-state="open"]');
  });
  it("is still the exact combination", () => {
    expect(shouldOpenOnShortcut({ ...ev, shiftKey: true }, { dialogOpen: false, drawerOpen: false })).toBe(false);
  });
});

describe("isApplePlatform", () => {
  it("Mac, iPhone, iPad and iPod are Apple; Windows, Linux and empty are not", () => {
    for (const p of ["MacIntel", "macOS", "iPhone", "iPad", "iPod touch"]) expect(isApplePlatform(p)).toBe(true);
    for (const p of ["Win32", "Windows", "Linux x86_64", "Android", ""]) expect(isApplePlatform(p)).toBe(false);
  });
});

describe("splitEmptyTitle", () => {
  it("splits around the query slot and keeps the curly quotes", () => {
    expect(splitEmptyTitle("No pages match \u201c{query}\u201d")).toEqual({ before: "No pages match \u201c", after: "\u201d" });
  });
  it("a template without the slot comes back whole", () => {
    expect(splitEmptyTitle("nothing")).toEqual({ before: "nothing", after: "" });
  });
});
