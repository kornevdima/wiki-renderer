/** The sidebar's order and content, and the folder line. */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import type { NavNode } from "@/content/runtime/types";

import { ReaderSidebar } from "./reader-sidebar";
import type { ReaderWiki } from "./reader-wiki";

const WIKI: ReaderWiki = { name: "Team guide", folder: "/vaults/team/wiki" };
const TREE: NavNode[] = [{ kind: "page", name: "a", path: "a.md", title: "A" }];

function render(wiki: ReaderWiki = WIKI, tree: NavNode[] = TREE): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages,
      children: createElement(ReaderSidebar, { wikiId: "w1", wiki, tree, activePath: "a.md" }),
    }),
  );
}

describe("ReaderSidebar", () => {
  it("lists, top to bottom: the brand, All wikis, the wiki name, the tree", () => {
    const out = render();
    const order = ['data-testid="brand"', 'data-testid="reader-all-wikis"', 'data-testid="reader-wiki-name"', 'data-testid="reader-nav"'].map((id) => out.indexOf(id));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain("Wiki Renderer");
    expect(out).toContain(">WR</span>");
    expect(out).toContain(">Wikis</span>");
    expect(out).toContain("Team guide");
  });

  it("All wikis goes to / and there is no wiki switcher and no select: the Language choice lives in the settings menu (US-286)", () => {
    const out = render();
    expect(out).toMatch(/<a [^>]*data-testid="reader-all-wikis"[^>]*href="\/"|<a [^>]*href="\/"[^>]*data-testid="reader-all-wikis"/);
    expect(out).not.toMatch(/<select|<option|<form|role="combobox"|listbox|locale-switcher|Language/);
  });

  it("shows the folder under the name, above the tree", () => {
    const out = render();
    expect(out).toContain('<span class="wr-literal">/vaults/team/wiki</span>');
    expect(out.indexOf('data-testid="reader-wiki-name"')).toBeLessThan(out.indexOf('data-testid="reader-wiki-folder"'));
    expect(out.indexOf('data-testid="reader-wiki-folder"')).toBeLessThan(out.indexOf('data-testid="reader-nav"'));
  });

  it("a wiki with no folder renders no folder line", () => {
    expect(render({ name: "Team guide" })).not.toContain("reader-wiki-folder");
  });

  it("an empty tree renders no nav", () => {
    const out = render(WIKI, []);
    expect(out).not.toContain("<nav");
  });

  it("is hidden in print", () => {
    expect(render()).toContain("print:hidden");
  });
});

describe("ReaderSidebar in the DS Sidebar (US-281)", () => {
  it("wraps the content in the DS aside, with the collapse button in the footer after the tree", () => {
    const out = render();
    expect(out).toMatch(/<aside aria-label="Wikis" data-slot="sidebar" data-collapsed="false"/);
    expect(out).toContain('data-slot="sidebar-footer"');
    expect(out).toContain('data-slot="sidebar-collapse"');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain(">Collapse sidebar</span>");
    expect(out.indexOf('data-testid="reader-nav"')).toBeLessThan(out.indexOf('data-slot="sidebar-footer"'));
  });

  it("keeps the brand (mark through brandProps, never the ESG PNG) outside the body that the strip hides", () => {
    const out = render();
    expect(out).not.toContain("esg-logo-mark.png");
    const body = out.indexOf('data-testid="reader-sidebar-body"');
    expect(out.indexOf('data-testid="brand"')).toBeLessThan(body);
    expect(out.indexOf('data-testid="reader-all-wikis"')).toBeGreaterThan(body);
    expect(out.indexOf('data-testid="reader-nav"')).toBeGreaterThan(body);
    expect(out.indexOf('data-testid="nav-close"')).toBeLessThan(body);
  });
});
