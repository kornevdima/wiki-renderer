/**
 * Component spec for `Breadcrumbs` (US-176), rendered with `renderToStaticMarkup`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";

const render = (crumbs: Array<{ label: string; href?: string }>) => renderToStaticMarkup(createElement(Breadcrumbs, { label: "Breadcrumb", crumbs }));

describe("Breadcrumbs", () => {
  const html = render([{ label: "Tenants", href: "/admin/tenants" }, { label: "Client A" }]);

  it("is a nav named by the label, with an ordered list", () => {
    expect(html).toContain('<nav aria-label="Breadcrumb"');
    expect(html).toContain("<ol");
    expect(html.match(/<li\b/g)).toHaveLength(2);
  });

  it("links every crumb but the last", () => {
    expect(html).toContain('<a class="');
    expect(html).toContain('href="/admin/tenants"');
    expect(html.match(/<a\b/g)).toHaveLength(1);
  });

  it("puts aria-current=page on the last crumb only, as text", () => {
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<span aria-current="page"[^>]*>Client A<\/span>/);
  });

  it("draws the separator as a hidden icon before every crumb after the first", () => {
    expect(html.match(/lucide-chevron-right/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });

  it("a three-level trail has two links, two separators and one current", () => {
    const three = render([{ label: "A", href: "/a" }, { label: "B", href: "/b" }, { label: "C" }]);
    expect(three.match(/<a\b/g)).toHaveLength(2);
    expect(three.match(/lucide-chevron-right/g)).toHaveLength(2);
    expect(three.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
