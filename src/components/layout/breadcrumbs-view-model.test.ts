/**
 * Unit specs for the breadcrumb view-model (US-176): the last crumb is the current page, the others link.
 */
import { describe, expect, it } from "vitest";

import { toBreadcrumbItems } from "./breadcrumbs-view-model";

describe("toBreadcrumbItems", () => {
  it("marks only the last crumb current and gives it no link", () => {
    expect(toBreadcrumbItems([{ label: "Tenants", href: "/admin/tenants" }, { label: "Client A", href: "/admin/tenants/1" }])).toEqual([
      { label: "Tenants", href: "/admin/tenants", current: false },
      { label: "Client A", href: null, current: true },
    ]);
  });

  it("a single crumb is the current page", () => {
    expect(toBreadcrumbItems([{ label: "Tenants" }])).toEqual([{ label: "Tenants", href: null, current: true }]);
  });

  it("an earlier crumb without an href is plain text, never a dead link", () => {
    expect(toBreadcrumbItems([{ label: "Admin" }, { label: "Tenants" }])[0]).toEqual({ label: "Admin", href: null, current: false });
  });

  it("an empty trail is empty", () => {
    expect(toBreadcrumbItems([])).toEqual([]);
  });
});
