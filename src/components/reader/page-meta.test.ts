/**
 * Component specs for `./page-meta` (US-220; TC-512, TC-514): `renderToStaticMarkup` with the real `messages/en.json`, fed from
 * the real `buildFrontmatterView`.
 */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { buildFrontmatterView } from "../../content/render/frontmatter-view";
import { PageMeta } from "./page-meta";

const line = (frontmatter: Record<string, unknown>): string =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages,
      children: createElement(PageMeta, { fields: buildFrontmatterView(frontmatter, () => "/w/x/p.md") }),
    }),
  );
const text = (markup: string) => markup.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the meta line (US-220)", () => {
  const out = line({ status: "accepted", updated: "2026-10-07", tags: ["adr", "reader"] });

  it("reads a success StatusBadge, 'Updated 7 Oct 2026' and the tags as a named list", () => {
    expect(out).toMatch(/^<div data-testid="page-meta" class="wr-meta /);
    expect(out).toMatch(/data-slot="status-badge" data-variant="success"[^>]*>.*Accepted<\/span>/);
    // HTML attribute names are case-insensitive: React's server renderer writes dateTime as given.
    expect(out).toMatch(/Updated <time datetime="2026-10-07">7 Oct 2026<\/time>/i);
    expect(out).toMatch(/<span role="list" aria-label="Tags"[^>]*><span role="listitem"[^>]*>adr<\/span><span role="listitem"[^>]*>reader<\/span><\/span>/);
    expect(text(out)).toBe("Accepted Updated 7 Oct 2026 adr reader");
  });

  it("is a div of spans: no p, ul or li for the article rules to restyle", () => {
    expect(out).not.toMatch(/<(p|ul|li|h[1-6])\b/);
  });

  it("created stands in for updated and never reads Updated", () => {
    const created = line({ created: "2026-09-12" });
    expect(text(created)).toBe("Created 12 Sep 2026");
    expect(created).not.toContain("Updated");
  });

  it("a missing field is left out, and no field gives no element at all", () => {
    const tagsOnly = line({ tags: ["a"] });
    expect(tagsOnly).not.toMatch(/status-badge|<time/);
    expect(line({ title: "T" })).toBe("");
    expect(line({})).toBe("");
  });

  it("an unusual status is neutral with its own word, escaped", () => {
    const o = line({ status: "<b>done</b>" });
    expect(o).toContain('data-variant="neutral"');
    expect(o).toContain("&lt;b&gt;done&lt;/b&gt;");
    expect(o).not.toContain("<b>");
  });

  it("hostile tags render as escaped text in chips that can wrap, with no element from them", () => {
    const o = line({ tags: ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "a&b", "x".repeat(400)] });
    expect(o).not.toMatch(/<script|<img/);
    expect(o).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(o).toContain("a&amp;b");
    expect(o).toMatch(/role="listitem" class="[^"]*\[overflow-wrap:anywhere\]/);
  });

  it("many tags are cut by the view with a visible mark outside the list", () => {
    const o = line({ tags: Array.from({ length: 500 }, (_, i) => `t${i}`) });
    expect(o.match(/role="listitem"/g)).toHaveLength(100);
    expect(o).toMatch(/<\/span><span>\(truncated\)<\/span><\/div>$/);
  });

  it("renders no heading, id or tabindex, and no Properties label", () => {
    expect(out).not.toMatch(/<h[1-6]|\sid=|tabindex|Properties/i);
  });
});
