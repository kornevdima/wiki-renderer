import { describe, expect, it } from "vitest";

import { parseResultHref } from "./focus-after-result";

describe("parseResultHref", () => {
  it("splits a heading hit into its committed pathname and the heading id", () => {
    expect(parseResultHref("/w/abc/alpha.md#user-content-setup-1")).toEqual({ pathname: "/w/abc/alpha.md", fragment: "user-content-setup-1" });
  });

  it("returns an empty fragment for a lead hit", () => {
    expect(parseResultHref("/w/abc/alpha.md")).toEqual({ pathname: "/w/abc/alpha.md", fragment: "" });
  });

  it("keeps a percent-encoded path as the browser reports it and decodes the fragment", () => {
    expect(parseResultHref("/w/abc/odd%20dir/a%23b.md#user-content-%C3%A9")).toEqual({
      pathname: "/w/abc/odd%20dir/a%23b.md",
      fragment: "user-content-é",
    });
  });

  it("uses the raw fragment when its escape is malformed", () => {
    expect(parseResultHref("/w/abc/a.md#user-content-%E0%A4%A").fragment).toBe("user-content-%E0%A4%A");
  });
});

// The loop is exercised against a minimal hand-written DOM and a manual frame queue (the project has no jsdom and a new
// dependency needs sign-off); `window`, `document`, `requestAnimationFrame` and `cancelAnimationFrame` are stubbed.
import { afterEach, beforeEach, vi } from "vitest";

import { cancelResultFocus, focusResultTarget } from "./focus-after-result";

interface FakeEl {
  attrs: Map<string, string>;
  focused: number;
  hasAttribute(n: string): boolean;
  setAttribute(n: string, v: string): void;
  focus(opts?: unknown): void;
}
const fakeEl = (tabindex?: string): FakeEl => {
  const attrs = new Map<string, string>();
  if (tabindex !== undefined) attrs.set("tabindex", tabindex);
  return {
    attrs,
    focused: 0,
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n, v) => void attrs.set(n, v),
    focus() {
      this.focused += 1;
    },
  };
};

describe("focusResultTarget", () => {
  let pathname = "/w/a/old.md";
  let byId: Record<string, FakeEl> = {};
  let main: FakeEl | null = null;
  let queue = new Map<number, () => void>();
  let next = 1;
  const frame = (): boolean => {
    const first = queue.entries().next();
    if (first.done) return false;
    queue.delete(first.value[0]);
    first.value[1]();
    return true;
  };

  beforeEach(() => {
    pathname = "/w/a/old.md";
    byId = {};
    main = fakeEl();
    queue = new Map();
    next = 1;
    vi.stubGlobal("window", { location: { get pathname() { return pathname; } } });
    vi.stubGlobal("document", { getElementById: (id: string) => byId[id] ?? null, querySelector: () => main });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => void queue.delete(id));
  });
  afterEach(() => {
    cancelResultFocus();
    vi.unstubAllGlobals();
  });

  it("waits until the pathname matches, then focuses the heading by its fragment id", () => {
    const heading = fakeEl();
    byId["user-content-setup"] = heading;
    focusResultTarget("/w/a/new.md#user-content-setup");
    frame();
    frame();
    expect(heading.focused).toBe(0);
    pathname = "/w/a/new.md";
    frame();
    expect(heading.focused).toBe(1);
    expect(main?.focused).toBe(0);
    expect(queue.size).toBe(0);
  });

  it("focuses main at once for a result with no fragment", () => {
    pathname = "/w/a/new.md";
    focusResultTarget("/w/a/new.md");
    frame();
    expect(main?.focused).toBe(1);
  });

  it("falls back to main when the heading is missing after the fallback bound, not before", () => {
    pathname = "/w/a/new.md";
    focusResultTarget("/w/a/new.md#user-content-gone");
    for (let i = 0; i < 29; i += 1) frame();
    expect(main?.focused).toBe(0);
    frame();
    expect(main?.focused).toBe(1);
  });

  it("gives up after the overall bound when the path never matches", () => {
    focusResultTarget("/w/a/never.md#x");
    let frames = 0;
    while (frame()) frames += 1;
    expect(frames).toBe(180);
    expect(main?.focused).toBe(0);
  });

  it("adds tabindex=-1 only when the element has none", () => {
    pathname = "/w/a/new.md";
    const bare = fakeEl();
    const own = fakeEl("0");
    byId.a = bare;
    byId.b = own;
    focusResultTarget("/w/a/new.md#a");
    frame();
    focusResultTarget("/w/a/new.md#b");
    frame();
    expect(bare.attrs.get("tabindex")).toBe("-1");
    expect(own.attrs.get("tabindex")).toBe("0");
  });

  it("a second call cancels the first loop", () => {
    const first = fakeEl();
    const second = fakeEl();
    byId.first = first;
    byId.second = second;
    focusResultTarget("/w/a/new.md#first");
    focusResultTarget("/w/a/new.md#second");
    expect(queue.size).toBe(1);
    pathname = "/w/a/new.md";
    while (frame());
    expect(first.focused).toBe(0);
    expect(second.focused).toBe(1);
  });
});
