/**
 * Component spec for `PageHeader` (US-176), rendered with `renderToStaticMarkup`.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeader, type PageHeaderProps } from "./page-header";

const render = (props: PageHeaderProps) => renderToStaticMarkup(createElement(PageHeader, props));
const icon: ReactNode = createElement("svg", { "data-icon": "x" });

describe("PageHeader", () => {
  it("renders the title as the page's one h1, keeping a caller's heading id and test id", () => {
    const html = render({ title: "Client A", titleId: "tenant-members-heading", titleTestId: "tenant-name-heading" });
    expect(html).toMatch(/<h1 id="tenant-members-heading" data-testid="tenant-name-heading"[^>]*>Client A<\/h1>/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("with only a title it has no breadcrumbs, no meta line and no actions area", () => {
    const html = render({ title: "Tenants" });
    expect(html).not.toContain("<nav");
    expect(html).not.toContain('data-testid="page-header-meta"');
    expect(html).not.toContain('data-testid="page-header-actions"');
  });

  it("renders breadcrumbs above the title, the last one aria-current", () => {
    const html = render({ title: "Client A", breadcrumbs: { label: "Breadcrumb", crumbs: [{ label: "Tenants", href: "/admin/tenants" }, { label: "Client A" }] } });
    expect(html.indexOf("<nav")).toBeLessThan(html.indexOf("<h1"));
    expect(html).toContain('aria-current="page"');
  });

  it("renders the meta line as a list, with the icon before the text", () => {
    const html = render({ title: "T", meta: [{ icon, text: "4 members" }, { text: "Created 15 Sep 2026" }] });
    expect(html).toMatch(/<ul data-testid="page-header-meta"/);
    expect(html.match(/<li\b/g)).toHaveLength(2);
    expect(html).toMatch(/<svg data-icon="x"><\/svg>4 members/);
  });

  it("renders the actions area after the title block", () => {
    const html = render({ title: "T", actions: createElement("button", null, "Delete") });
    expect(html).toContain('data-testid="page-header-actions"');
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("Delete"));
  });

  it("an empty meta list renders no list", () => {
    expect(render({ title: "T", meta: [] })).not.toContain("<ul");
  });

  it("puts a test id on the root", () => {
    expect(render({ title: "T", testId: "project-detail-heading" })).toMatch(/^<div data-testid="project-detail-heading"/);
  });
});
