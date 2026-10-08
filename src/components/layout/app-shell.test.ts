/**
 * Component spec for the shell, topbar, menu button and brand (US-176), rendered with `renderToStaticMarkup` (the drawer's
 * open behaviour is `app-shell-state.test.ts` plus e2e; here the closed markup and the wiring are pinned).
 */
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup as renderStatic } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";

import { AppShell, APP_NAV_ID } from "./app-shell";
import { Brand } from "./brand";
import { brandProps, type BrandStrings } from "@/components/brand-props";
import { NavToggle } from "./nav-toggle";
import { Topbar } from "./topbar";

const html = (element: ReactElement) => renderStatic(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: element }));

const shell = () =>
  html(
    createElement(AppShell, {
      testId: "admin-shell",
      sidebar: createElement("nav", null, "Nav"),
      topbar: createElement(Topbar, { leading: createElement(NavToggle) }, "Actions"),
      children: createElement("main", null, "Page"),
    }),
  );

describe("AppShell", () => {
  it("renders the sidebar, the scrim, the topbar and the page, closed: nothing inert, the drawer marked closed", () => {
    const out = shell();
    expect(out).toContain('data-testid="admin-shell"');
    expect(out).toContain(`id="${APP_NAV_ID}"`);
    expect(out).toContain('data-testid="app-shell-scrim"');
    expect(out).toContain("Nav");
    expect(out).toContain("Page");
    expect(out).toContain('data-open="false"');
    expect(out).not.toContain("inert");
  });

  it("takes optional data-* attributes for the wrapper (the reader's data-wiki-id); with none, the admin markup is unchanged (US-187)", () => {
    const withData = html(
      createElement(AppShell, {
        testId: "reader-shell",
        dataAttributes: { "data-wiki-id": "w1" },
        sidebar: createElement("nav", null, "Nav"),
        topbar: createElement(Topbar, null, "Actions"),
        children: createElement("main", null, "Page"),
      }),
    );
    expect(withData).toMatch(/^<div data-wiki-id="w1" data-testid="reader-shell" data-open="false"/);
    expect(shell()).toMatch(/^<div data-testid="admin-shell" data-open="false"/);
  });

  it("narrows the sidebar column to sidebar-w-collapsed from bp-lg when the Sidebar is collapsed; full width by default", () => {
    expect(shell()).toContain("lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]");
    expect(shell()).not.toContain("data-sidebar-collapsed");
    const collapsed = html(createElement(AppShell, { sidebarCollapsed: true, sidebar: createElement("nav", null, "Nav"), topbar: createElement(Topbar, { leading: createElement(NavToggle) }), children: createElement("main", null, "Page") }));
    expect(collapsed).toContain("lg:grid-cols-[var(--sidebar-w-collapsed)_minmax(0,1fr)]");
    expect(collapsed).toContain('data-sidebar-collapsed="true"');
  });

  it("wraps the page in the content column with the gutter", () => {
    expect(shell()).toMatch(/px-4[^"]*lg:p-8[^"]*"><main>Page<\/main>/);
  });

  it("is a drawer below bp-lg (fixed, at z-drawer, hidden until open, scrim below it) and static at bp-lg", () => {
    const out = shell();
    expect(out).toContain("max-lg:fixed");
    expect(out).toContain("max-lg:z-(--z-drawer)");
    expect(out).toContain("max-lg:invisible");
    expect(out).toContain("z-[calc(var(--z-drawer)-1)]");
    expect(out).toContain("bg-scrim");
    expect(out).toContain("lg:sticky");
    expect(out).toContain("lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]");
  });

  it("the slide exists only under motion-safe, so under reduced motion no transition rule can win the cascade; nothing transitions every property", () => {
    const out = shell();
    const sidebar = /id="app-nav"[^>]*class="([^"]*)"/.exec(out)?.[1] ?? "";
    const transitionClasses = sidebar.split(/\s+/).filter((c) => /transition|duration|ease-/.test(c));
    expect(transitionClasses.length).toBeGreaterThan(0);
    for (const c of transitionClasses) expect(c, c).toMatch(/^motion-safe:/);
    expect(out).not.toContain("transition-all");
  });

  it("the transitioned property is the one the offset classes set: translate-x-* sets `translate`, so the slide names `translate`, not `transform`", () => {
    const out = shell();
    expect(out).toContain("-translate-x-full");
    expect(out).toContain("transition-[translate,visibility]");
    expect(out).toContain("[transition-property:translate]");
    expect(out).not.toMatch(/transition-\[transform|transition-property:transform/);
  });

  it("the topbar sticks over a column that holds the whole page, and the page's main is a minmax(0,1fr) stack", () => {
    const out = shell();
    expect(out).toContain("sticky top-0");
    expect(out).not.toContain("grid-rows-[var(--topbar-h)");
    expect(out).toContain("[&amp;&gt;main]:grid-cols-[minmax(0,1fr)]");
  });

  it("the page behind the drawer is the topbar and the content (the sidebar is outside both)", () => {
    const source = shell();
    expect(source.indexOf('id="app-nav"')).toBeLessThan(source.indexOf("Actions"));
  });
});

describe("NavToggle", () => {
  it("is the Open navigation button, collapsed, naming the sidebar, and hidden at bp-lg", () => {
    const out = shell();
    expect(out).toMatch(/<button[^>]*data-testid="nav-toggle"[^>]*aria-label="Open navigation"[^>]*aria-expanded="false"[^>]*aria-controls="app-nav"/);
    expect(out).toContain("lg:hidden");
  });

  it("renders nothing outside an AppShell (the home has no drawer)", () => {
    expect(html(createElement(NavToggle))).toBe("");
  });
});

describe("Topbar", () => {
  it("is the app-header banner with the leading slot first and the actions after it, hidden when printed", () => {
    const out = html(createElement(Topbar, { leading: createElement("i", null, "L") }, "A"));
    expect(out).toMatch(/^<header data-testid="app-header"/);
    expect(out.indexOf(">L<")).toBeLessThan(out.indexOf(">A<"));
    expect(out).toContain("print:hidden");
    expect(out).toContain("flex-wrap");
  });
});

describe("Brand", () => {
  const props = (over: Partial<BrandStrings> = {}): BrandStrings => ({ company: "Wiki Renderer", product: "Wikis", initials: "", logo: "", tone: "indigo", ...over });

  it("links to / with a decorative TenantLogo and both lines of text, visually hidden (not removed) on a narrow screen", () => {
    const out = html(createElement(Brand, brandProps(props())));
    expect(out).toMatch(/<a [^>]*href="\/"/);
    expect(out).toMatch(/<span data-slot="tenant-logo" data-size="s" data-kind="initials" data-tone="indigo" aria-hidden="true"[^>]*>WR<\/span>/);
    expect(out).toContain("rounded-(--ds-radius-mark)");
    expect(out).not.toContain("--gradient-brand)");
    expect(out).not.toContain("esg-logo-mark.png");
    expect(out).toContain("Wiki Renderer");
    expect(out).toContain("max-md:sr-only");
  });

  it("explicit initials and tone, and a logo image in place of the initials", () => {
    expect(html(createElement(Brand, brandProps(props({ initials: "es", tone: "glow" }))))).toMatch(/data-tone="glow"[^>]*>ES<\/span>/);
    expect(html(createElement(Brand, brandProps(props({ tone: "brand" }))))).toContain('data-tone="indigo"');
    const logo = html(createElement(Brand, brandProps(props({ logo: "/api/brand/logo" }))));
    expect(logo).toMatch(/<img data-slot="tenant-logo-image" src="\/api\/brand\/logo" alt=""/);
    expect(logo).not.toContain(">WR<");
  });
});
