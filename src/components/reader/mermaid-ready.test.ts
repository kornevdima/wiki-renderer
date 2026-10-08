import { afterEach, describe, expect, it, vi } from "vitest";

import { beginMermaidView, getMermaidReady, getMermaidViewKey, getMermaidViewState, subscribeMermaidView } from "./mermaid-ready";

const SLOT = Symbol.for("wiki-renderer.reader.mermaidReady");
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SLOT];
});

describe("the view key (C1)", () => {
  it("is null with no view, the begun key while current, and null again after end()", () => {
    expect(getMermaidViewKey()).toBeNull();
    const view = beginMermaidView("p.md#1#abc");
    expect(getMermaidViewKey()).toBe("p.md#1#abc");
    view.settle();
    expect(getMermaidViewKey()).toBe("p.md#1#abc");
    view.end();
    expect(getMermaidViewKey()).toBeNull();
  });
});

describe("the view state Save as PDF reads (US-106, TC-480)", () => {
  it("is none before any view begins, while getMermaidReady() is already resolved", async () => {
    expect(getMermaidViewState()).toBe("none");
    await expect(getMermaidReady()).resolves.toBeUndefined();
  });
  it("is drawing from begin until settle, then settled", () => {
    const view = beginMermaidView();
    expect(getMermaidViewState()).toBe("drawing");
    view.settle();
    expect(getMermaidViewState()).toBe("settled");
  });
  it("end() settles the view and then reports none until the next one begins (navigation)", async () => {
    const one = beginMermaidView();
    one.end();
    expect(getMermaidViewState()).toBe("none");
    await one.promise;
    const two = beginMermaidView();
    expect(getMermaidViewState()).toBe("drawing");
    two.settle();
    expect(getMermaidViewState()).toBe("settled");
  });
  it("a stale view's late end() does not clobber the newer view", () => {
    const one = beginMermaidView();
    const two = beginMermaidView();
    one.end();
    expect(getMermaidViewState()).toBe("drawing");
    two.settle();
  });
  it("notifies subscribers on begin, settle and end, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribeMermaidView(listener);
    const view = beginMermaidView();
    view.settle();
    view.settle();
    view.end();
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    beginMermaidView().settle();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
