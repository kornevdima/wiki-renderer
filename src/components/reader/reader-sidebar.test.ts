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
  it("lists, top to bottom: the brand, All wikis, the wiki name, the tree, the Language select", () => {
    const out = render();
    const order = ['data-testid="brand"', 'data-testid="reader-all-wikis"', 'data-testid="reader-wiki-name"', 'data-testid="reader-nav"', 'data-testid="locale-switcher"'].map((id) => out.indexOf(id));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain("The Firm");
    expect(out).toContain(">Wikis</span>");
    // US-212 R12: the select leads with the globe glyph and is the chrome's 40px (`control-h-m`) height.
    expect(out).toMatch(/>Language <span class="relative block">.*lucide-globe.*<select id="locale-switcher-select"[^>]*min-h-\(--control-h-m\)/);
    expect(out).toContain("Team guide");
  });

  it("All wikis goes to / and there is no wiki switcher: the select is the one English-only Language select", () => {
    const out = render();
    expect(out).toMatch(/<a [^>]*data-testid="reader-all-wikis"[^>]*href="\/"|<a [^>]*href="\/"[^>]*data-testid="reader-all-wikis"/);
    expect(out.match(/<select\b/g)).toHaveLength(1);
    expect(out.match(/<option\b/g)).toHaveLength(1);
    expect(out).not.toMatch(/<form|role="combobox"|listbox/);
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

  it("an empty tree renders no nav, and the Language select is still in the foot", () => {
    const out = render(WIKI, []);
    expect(out).not.toContain("<nav");
    expect(out).toContain('data-testid="locale-switcher"');
  });

  it("is hidden in print", () => {
    expect(render()).toContain("print:hidden");
  });
});
