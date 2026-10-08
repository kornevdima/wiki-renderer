/**
 * Component specs for the "On this page" list and its mount points (US-219, FR-053, SA-MOD Reader UI and print E3-2, E3-D5).
 * `renderToStaticMarkup` with the REAL `messages/en.json`, so the ruled title is checked verbatim.
 */
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { buildFrontmatterView } from "../../content/render/frontmatter-view";
import type { OutlineEntry } from "../../content/render/types";
import { OnThisPage } from "./on-this-page";
import { PageShell } from "./page-shell";
import { setCurrentSection } from "./section-spy-store";

function html(element: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: element }));
}
const e = (depth: 2 | 3, id: string, text = id): OutlineEntry => ({ depth, id, text });
const SIX = [e(2, "user-content-a", "Alpha"), e(2, "user-content-b", "Beta"), e(3, "user-content-b1", "Beta one"), e(3, "user-content-b2", "Beta two"), e(2, "user-content-c", "Gamma"), e(2, "user-content-d", "Delta")];
const shell = (props: Record<string, unknown>) =>
  html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: "p.md", children: createElement("p", null, "body"), ...props }));

afterEach(() => setCurrentSection(null));

describe("OnThisPage (US-219)", () => {
  it("the rail copy is a nav named by its visible title 'On this page', holding the entries in page order with each h3 under its h2", () => {
    const out = html(createElement(OnThisPage, { outline: SIX, variant: "rail" }));
    expect(out).toMatch(/^<nav class="wr-toc wr-toc--rail print:hidden" aria-labelledby="toc-title-rail" data-testid="toc-rail">/);
    expect(out).toContain('<p class="wr-toc__title" id="toc-title-rail">On this page</p>');
    expect([...out.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1])).toEqual(SIX.map((x) => x.id));
    expect(out).toContain('<li><a href="#user-content-b" data-toc="user-content-b">Beta</a><ul><li><a href="#user-content-b1"');
    expect(out.match(/<ul>/g)).toHaveLength(2);
  });
  it("the folded copy is a closed native details whose summary is its name, not open, and has no landmark", () => {
    const out = html(createElement(OnThisPage, { outline: SIX, variant: "folded" }));
    expect(out).toMatch(/^<details class="wr-toc wr-toc--inline print:hidden" data-testid="toc-inline"><summary>On this page<\/summary>/);
    expect(out).not.toMatch(/<details[^>]*\bopen\b/);
    expect(out).not.toContain("<nav");
  });
  it("renders no mark on the server even when the store holds a section (the server snapshot is null, so hydration matches)", () => {
    setCurrentSection("user-content-c");
    for (const variant of ["rail", "folded"] as const) {
      expect(html(createElement(OnThisPage, { outline: SIX, variant }))).not.toContain("aria-current");
    }
  });
  it("marks nothing when no section is current, and escapes entry text", () => {
    const out = html(createElement(OnThisPage, { outline: [e(2, "x", "<b>&</b>"), e(2, "y"), e(2, "z")], variant: "rail" }));
    expect(out).not.toContain("aria-current");
    expect(out).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(out).not.toContain("<b>");
  });
});

describe("PageShell mounts (US-219, E3-D5)", () => {
  it("three or more entries: the rail aside holds the list above All properties, and the anchor region is present", () => {
    const out = shell({ outline: SIX, frontmatter: buildFrontmatterView({ a: 1 }) });
    expect(out.match(/data-testid="reader-rail"/g)).toHaveLength(1);
    expect(out.match(/data-testid="toc-rail"/g)).toHaveLength(1);
    expect(out.indexOf('data-testid="toc-rail"')).toBeLessThan(out.indexOf('data-testid="frontmatter-panel"'));
    expect(out.indexOf('data-testid="reader-content"')).toBeLessThan(out.indexOf('data-testid="reader-rail"'));
    expect(out.match(/<aside/g)).toHaveLength(1);
    expect(out.match(/data-testid="anchor-status"/g)).toHaveLength(1);
    expect(out).toContain('role="status" aria-live="polite"');
    expect(out).toContain("wr-layout wr-layout--aside");
  });
  it("three or more entries and no frontmatter: the rail holds the list alone", () => {
    const out = shell({ outline: SIX });
    expect(out).toContain('data-testid="reader-rail"');
    expect(out).toContain('data-testid="toc-rail"');
    expect(out).not.toContain('data-testid="frontmatter-panel"');
  });
  it("fewer than three entries: no list, no rail without frontmatter, but the anchors' region is still there", () => {
    const out = shell({ outline: [e(2, "a"), e(2, "b")] });
    expect(out).not.toContain("On this page");
    expect(out).not.toContain("toc-");
    expect(out).not.toContain("reader-rail");
    expect(out).toContain('data-testid="anchor-status"');
  });
  it("no outline (the empty view, the source view): no list, no region, no rail", () => {
    for (const props of [{}, { outline: [] }]) {
      const out = shell(props);
      expect(out).not.toContain("anchor-status");
      expect(out).not.toContain("On this page");
      expect(out).not.toContain("reader-rail");
    }
  });
});
