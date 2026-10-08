import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BareFrame } from "./bare-frame";

// US-195: the bare frame. Computed layout (bar height, border, centring, 375px fit) is the e2e's.
const out = renderToStaticMarkup(
  createElement(BareFrame, { brand: { company: "The Firm", product: "Wikis" }, testId: "x-view", kind: "k", children: createElement("p", null, "inside") }),
);

describe("US-195: BareFrame", () => {
  it("is a slim bar then the page's one main, with the skip target, the caller's test id and kind", () => {
    expect(out.match(/<main\b/g)).toHaveLength(1);
    expect(out).toContain('<main id="main" tabindex="-1" data-testid="x-view" data-kind="k"');
    expect(out.indexOf("<header")).toBeLessThan(out.indexOf("<main"));
    expect(out.indexOf("</header>")).toBeLessThan(out.indexOf("inside"));
  });

  it("the bar is --topbar-h tall with a hairline bottom border and holds the brand lockup at its text, showing both lines", () => {
    const bar = out.match(/<header.*?<\/header>/)![0];
    expect(bar).toContain("h-(--topbar-h)");
    expect(bar).toMatch(/\bborder-b border-border\b/);
    expect(bar).toContain('data-testid="brand"');
    expect(bar).not.toContain("max-md:sr-only");
    expect(bar).toContain("Wikis");
  });

  it("centres a minmax(0,1fr) column on the page ground, with no sign-in column", () => {
    expect(out).toContain("bg-background");
    expect(out).toContain("grid-cols-[minmax(0,1fr)]");
    expect(out).toContain("place-items-center");
    expect(out).not.toContain("max-w-[440px]");
  });

  it("omits data-kind when none is given", () => {
    const bare = renderToStaticMarkup(createElement(BareFrame, { brand: { company: "a", product: "b" }, testId: "t", children: null }));
    expect(bare).not.toContain("data-kind");
  });
});
