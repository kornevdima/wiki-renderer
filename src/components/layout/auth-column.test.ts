import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthColumn } from "./auth-column";

// US-177: the sign-in and join frame. Computed layout (centred, 320px fit) is the e2e's.
const html = renderToStaticMarkup(
  createElement(AuthColumn, { brand: { company: "The Firm", product: "wiki-renderer" }, testId: "sign-in", children: createElement("p", null, "inside") }),
);

describe("US-177: AuthColumn", () => {
  it("is the page's one main, with the skip link's target and its test id", () => {
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('<main id="main" tabindex="-1" data-testid="sign-in"');
  });

  it("holds the brand lockup then the children in a 440px minmax(0,1fr) column, with a 16px gutter", () => {
    expect(html).toContain("max-w-[440px]");
    expect(html).toContain("grid-cols-[minmax(0,1fr)]");
    expect(html).toMatch(/\bpx-4\b/);
    expect(html.indexOf('data-testid="brand"')).toBeLessThan(html.indexOf("inside"));
  });

  it("the brand lockup links to /signin", () => {
    expect(html).toMatch(/<a [^>]*href="\/signin"[^>]*data-testid="brand"|<a [^>]*data-testid="brand"[^>]*href="\/signin"/);
  });

  it("shows the brand text at every width and has no topbar", () => {
    expect(html).toContain("wiki-renderer");
    expect(html).not.toContain("max-md:sr-only");
    expect(html).not.toContain("<header");
  });
});

describe("US-178: AuthColumn brandHref", () => {
  it("links the lockup where the caller says (the signed-in bare states and the 404 go to /)", () => {
    const home = renderToStaticMarkup(
      createElement(AuthColumn, { brand: { company: "The Firm", product: "wiki-renderer" }, testId: "x", brandHref: "/", children: null }),
    );
    expect(home).toMatch(/<a [^>]*href="\/"[^>]*data-testid="brand"|<a [^>]*data-testid="brand"[^>]*href="\/"/);
  });
});
