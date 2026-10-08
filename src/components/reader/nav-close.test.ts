/** US-222 (SA-MOD Reader UI and print E3-D11): the drawer's own "Close navigation" button. */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { AppShell } from "@/components/layout/app-shell";

import { NavClose } from "./nav-close";
import { PageShell } from "./page-shell";

const html = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: el }));

describe("NavClose", () => {
  it("is a button named 'Close navigation' from messages, visible below lg only and never in print", () => {
    expect(messages.readerShell.closeNavigation).toBe("Close navigation");
    const out = html(createElement(AppShell, { sidebar: createElement(NavClose, { label: "Close navigation" }), topbar: null, children: null }));
    const button = /<button[^>]*data-testid="nav-close"[^>]*>/.exec(out)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-label="Close navigation"');
    expect(button).toContain("lg:hidden");
    expect(button).toContain("print:hidden");
  });
  it("renders nothing outside an AppShell (it needs the shell's toggle)", () => {
    expect(html(createElement(NavClose, { label: "Close navigation" }))).toBe("");
  });
  it("sits after the brand link in the sidebar, so focus-on-open still lands on the brand", () => {
    const out = html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: null }));
    const sidebar = out.slice(out.indexOf('data-testid="reader-sidebar"'));
    const firstFocusable = /<(a|button)\b[^>]*>/.exec(sidebar)![0];
    expect(firstFocusable).toContain('data-testid="brand"');
    expect(sidebar.indexOf('data-testid="brand"')).toBeLessThan(sidebar.indexOf('data-testid="nav-close"'));
  });
});
