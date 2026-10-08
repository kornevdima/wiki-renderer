/**
 * US-160 specs: wikilinks in frontmatter values, from the real render pass to the real panel markup. The snapshot is
 * built the way `embeds.test.ts` builds one, so the body resolver and the panel resolve against one `LinkMap`.
 */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { pageHref } from "../../content/links/page-href";
import { buildLinkMap } from "../../content/links/link-map";
import { MAX_LINKS, MAX_STRING, buildFrontmatterView, isLinkedText } from "../../content/render/frontmatter-view";
import { parsePages } from "../../content/render/parse";
import { renderPage } from "../../content/render/render";
import { resetRenderCacheForTests } from "../../content/render/render-cache.testing";
import type { FileEntry, WikiSnapshot } from "../../content/runtime/types";
import messages from "../../../messages/en.json";
import { AllProperties } from "./all-properties";

const enc = new TextEncoder();
const WIKI = "w1";

function snapshot(extra: Record<string, string>, frontmatter: string): WikiSnapshot {
  const files = new Map<string, FileEntry>();
  const all: Record<string, string> = {
    "p.md": `---\n${frontmatter}\n---\n[[Page]] [[Missing]] [[Page#Sec]]\n`,
    "Page.md": "# Sec\n",
    "dir/Dup.md": "x",
    "other/Dup.md": "y",
    "a b & c.md": "z",
    ...extra,
  };
  for (const [path, text] of Object.entries(all)) files.set(path, { bytes: enc.encode(text), contentType: "text/markdown" });
  files.set("image.png", { bytes: new Uint8Array([1]), contentType: "image/png" });
  const pages = parsePages(files);
  return { wikiId: WIKI, sha: "abc", files, pages, linkMap: buildLinkMap(pages, files, WIKI, "abc"), searchIndexJson: "", tree: [] };
}

function panelFor(frontmatter: string, extra: Record<string, string> = {}) {
  const snap = snapshot(extra, frontmatter);
  const r = renderPage(snap, "p.md");
  if ("state" in r) throw new Error("unavailable");
  const body = renderToStaticMarkup(r.content as never);
  const html = renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: createElement(AllProperties, { fields: r.frontmatterView }) }),
  );
  return { html, body, view: r.frontmatterView };
}
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

beforeEach(() => resetRenderCacheForTests());

describe("US-160 S1: a resolved wikilink is the body's link", () => {
  it("the panel href equals the body href for the same [[Page]] and [[Page#Sec]]", () => {
    const { html, body } = panelFor('a: "[[Page]]"\nb: "[[Page#Sec]]"');
    const bodyHrefs = hrefs(body);
    expect(hrefs(html)).toEqual([bodyHrefs[0], bodyHrefs[1]]);
    expect(bodyHrefs[1]).toContain("#user-content-sec");
    expect(html).toMatch(/class="wikilink [^"]*\bunderline\b/);
  });

  it("a page with special characters in its name goes through the same href builder", () => {
    const { html, body } = panelFor('a: "[[a b & c]]"', { "p.md": '---\na: "[[a b & c]]"\n---\n[[a b & c]]\n' });
    expect(hrefs(html)).toEqual(hrefs(body));
    expect(hrefs(html)).toHaveLength(1);
  });

  it("[[a|b]] shows the display text; [[a#h|b]] too", () => {
    const { html } = panelFor('a: "[[Page|shown]]"\nb: "[[Page#Sec|other]]"');
    expect(html).toMatch(/<a [^>]*>shown<\/a>/);
    expect(html).toMatch(/<a [^>]*>other<\/a>/);
  });

  it("a cross-page [[Page#Sec]] is prefixed once", () => {
    const { html } = panelFor('a: "[[Page#Sec]]"');
    expect(hrefs(html)[0]).toMatch(/#user-content-sec$/);
    expect(hrefs(html)[0]).not.toContain("user-content-user-content-");
  });

  it("the same-page [[#Sec]] is the current page's href plus the prefixed fragment, once, as the body writes it", () => {
    const { html, body } = panelFor('a: "[[#Sec]]"', { "p.md": '---\na: "[[#Sec]]"\n---\n# Sec\n\n[[#Sec]]\n' });
    expect(hrefs(html)).toEqual([`${pageHref(WIKI, "p.md")}#user-content-sec`]);
    expect(hrefs(html)[0]).not.toContain("user-content-user-content-");
    expect(hrefs(body)).toContain("#user-content-sec");
  });
});

describe("US-160 S2: unresolved and ambiguous are the US-081 marker with no href", () => {
  it("renders the body's marker and copy, no a, no href", () => {
    const { html, body } = panelFor('a: "[[No such page]]"\nb: "[[Dup]]"');
    expect(html).not.toContain("href=");
    expect((html.match(/class="wikilink-unavailable"/g) ?? []).length).toBe(2);
    expect(html).toContain(messages.wikilinks.unavailableTooltip);
    expect(html).toContain(messages.wikilinks.unavailableLabel);
    expect(body).toContain('class="wikilink-unavailable"');
  });

  it("a target that names an asset (not a page) is unavailable too", () => {
    const { html } = panelFor('a: "[[image.png]]"');
    expect(html).not.toContain("href=");
    expect(html).toContain("wikilink-unavailable");
  });
});

describe("US-160 S3: several links, lists, text between kept", () => {
  it('"[[Page|first]] and [[Missing]]" keeps " and "', () => {
    const { html } = panelFor('a: "[[Page|first]] and [[Missing]]"');
    expect(html).toMatch(/<\/a> and <span class="wikilink-unavailable"/);
  });

  it("each string item of a list is its own link or marker", () => {
    const { html } = panelFor('a: ["[[Page]]", "[[Missing]]", plain]');
    expect(html).toMatch(/<li><span[^>]*><a [^>]*>Page<\/a><\/span><\/li><li><span[^>]*><span class="wikilink-unavailable"/);
    expect(html).toContain("<li><span>plain</span></li>");
  });

  it("a map value's string is linked, its key stays text", () => {
    const { html } = panelFor('m:\n  "[[Page]]": "[[Page]]"');
    expect(html).toContain('<li><span class="wr-literal">[[Page]]</span>: ');
    expect(hrefs(html)).toHaveLength(1);
  });

  it("non-wikilink text, numbers and null stay as they were", () => {
    const { html, view } = panelFor('a: "no links [here] or [[ ]]"\nn: 3\nz:');
    expect(html).toContain("<span>no links [here] or [[ ]]</span>");
    expect(view.map((f) => isLinkedText(f.value))).toEqual([false, false, false]);
  });
});

describe("US-160 S4 and D4: confined, hostile values stay text", () => {
  it("a javascript: URL and an http URL value give no href", () => {
    const { html } = panelFor('a: "javascript:alert(1)"\nb: "[x](javascript:alert(1))"\nc: "https://example.com"');
    expect(html).not.toContain("href=");
    expect(html).toContain("javascript:alert(1)");
  });

  it("a wikilink whose target is a path escape or another wiki is unavailable, never a href", () => {
    const { html } = panelFor('a: "[[../../etc/passwd]]"\nb: "[[/w/other/Page]]"\nc: "[[javascript:alert(1)]]"');
    expect(html).not.toContain("href=");
    expect((html.match(/wikilink-unavailable"/g) ?? []).length).toBe(3);
  });

  it("markup in a value or in a link's display text is escaped", () => {
    const { html } = panelFor('a: "<b>x</b> [[Page|<img src=x onerror=alert(1)>]]"');
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("an author map shaped like a token list is not one", () => {
    const { html, view } = panelFor('a:\n  tokens:\n    - {kind: link, text: x, href: "javascript:alert(1)"}');
    expect(isLinkedText(view[0]?.value)).toBe(false);
    expect(html).not.toContain("href=");
  });
});

describe("US-160 D2: embeds are not embedded", () => {
  it("![[image.png]] gives no img and no transclusion; ![[Page]] is a plain link", () => {
    const { html } = panelFor('a: "![[image.png]]"\nb: "![[Page]]"');
    expect(html).not.toContain("<img");
    expect(hrefs(html)).toHaveLength(1);
  });
});

describe("US-160 D3: tokenised after the bound", () => {
  it("a link straddling the 2,000-character bound is plain text up to the cut, then (truncated)", () => {
    const value = `${"x".repeat(MAX_STRING - 4)}[[Page]] tail`;
    const { html } = panelFor(`a: "${value}"`);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("wikilink-unavailable");
    expect(html).toContain("[[Pa (truncated)");
  });

  it("a link wholly inside the bound still links beside the (truncated) mark", () => {
    const { html } = panelFor(`a: "[[Page]] ${"x".repeat(MAX_STRING)}"`);
    expect(hrefs(html)).toHaveLength(1);
    expect(html).toContain("(truncated)");
  });
});

describe("US-160 pure builder", () => {
  it("without a resolver the view is exactly US-071's data", () => {
    expect(buildFrontmatterView({ a: "[[X]]" })).toEqual([{ key: "a", value: "[[X]]" }]);
  });

  it("the resolver's answer alone decides link versus marker, and the tokens carry no other href", () => {
    const view = buildFrontmatterView({ a: "[[Yes]] [[No]]" }, (n) => (n.target === "Yes" ? "/h" : undefined));
    const v = view[0]?.value;
    expect(isLinkedText(v) && v.tokens).toEqual([
      { kind: "link", text: "Yes", href: "/h" },
      { kind: "text", text: " " },
      { kind: "unavailable", text: "No" },
    ]);
  });

  it("more than MAX_LINKS wikilinks: the rest stay literal text and the resolver is not called for them", () => {
    let calls = 0;
    const many = "[[a]]".repeat(MAX_LINKS + 20);
    const view = buildFrontmatterView({ a: many.slice(0, 1900), b: many.slice(0, 1900) }, () => {
      calls++;
      return undefined;
    });
    expect(calls).toBeLessThanOrEqual(MAX_LINKS);
    expect(view).toHaveLength(2);
  });

  it("the 501st wikilink is a text token with its literal brackets; exactly 500 are links", () => {
    const half = "[[a]]".repeat(251); // 502 links in all; the cap is the documented 500, pinned here as a literal
    const view = buildFrontmatterView({ a: half, b: half }, () => "/h");
    const tokens = view.flatMap((f) => (isLinkedText(f.value) ? f.value.tokens : []));
    expect(tokens.filter((t) => t.kind === "link")).toHaveLength(500);
    const last = tokens[tokens.length - 1];
    expect(last).toEqual({ kind: "text", text: "[[a]]" });
  });

  it("a hostile value of repeated [[ is linear and fast", () => {
    const start = performance.now();
    buildFrontmatterView({ a: "[[".repeat(1000), b: "[[a".repeat(660) }, () => undefined);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
