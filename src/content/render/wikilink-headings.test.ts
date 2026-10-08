/**
 * US-077 rendered half (S06 wave 5, H1-H6, TC-446): every heading fragment in the sanitised output of the FULL
 * `renderPage` lands on an id that exists on the page it targets.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import { pageHref } from "@/content/links/page-href";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { CLOBBER_PREFIX } from "./sanitize-schema";

const enc = new TextEncoder();
const WIKI = "wiki-h";
let n = 0;
const TARGET = "Target.md";
const TARGET_PAGE = "# Target\n\n## Some Heading\n\n## Repeated\n\n## Repeated\n\n## Ünï Heading: Punct!\n";
const SELF = [
  "# Top",
  "",
  "## Local Heading",
  "",
  "## Twice",
  "",
  "## Twice",
  "",
  "[[Target#Some Heading]] [[Target#Repeated]] [[Target#repeated-1]] [[Target#Missing]]",
  "[[#Local Heading]] [[#Twice]] [[#twice-1]] [[#Nowhere]] [[#Local Heading|shown]] [[Target#Ünï Heading: Punct!]]",
  "[y](#local-heading)",
].join("\n");

function snapshot(entries: Record<string, string>): WikiSnapshot {
  const files = new Map<string, FileEntry>(Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]));
  const pages = parsePages(files);
  const sha = `sha${n++}`;
  return { wikiId: WIKI, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI, sha), searchIndexJson: "", tree: [] };
}
function html(snap: WikiSnapshot, path: string): string {
  const r = renderPage(snap, path);
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}
const ids = (markup: string) => new Set([...markup.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!));
const hrefs = (markup: string) => [...markup.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]!);

beforeEach(() => resetRenderCacheForTests());

describe("heading hrefs (US-077, W5-1)", () => {
  const snap = snapshot({ [TARGET]: TARGET_PAGE, "Self.md": SELF });
  const self = html(snap, "Self.md");
  const target = html(snap, TARGET);
  const base = pageHref(WIKI, TARGET);

  it("H1: a cross-page heading link ends in #user-content-<slug> and that id exists on the target", () => {
    expect(self).toContain(`<a href="${base}#user-content-some-heading" class="wikilink">Target &gt; Some Heading</a>`);
    expect(ids(target).has("user-content-some-heading")).toBe(true);
  });
  it("H2: a missing heading links to the page with no fragment, and is an a.wikilink", () => {
    expect(self).toContain(`<a href="${base}" class="wikilink">Target &gt; Missing</a>`);
  });
  it("H4: duplicate headings resolve to their own ids (repeated, repeated-1)", () => {
    expect(self).toContain(`href="${base}#user-content-repeated"`);
    expect(self).toContain(`href="${base}#user-content-repeated-1"`);
    expect(ids(target)).toEqual(expect.objectContaining(new Set(["user-content-repeated", "user-content-repeated-1"])));
  });
  it("H5: [[#H]] is #user-content-<slug> on the same page; a missing heading is the current page's own URL", () => {
    expect(self).toContain(`<a href="#user-content-local-heading" class="wikilink">Local Heading</a>`);
    expect(self).toContain(`<a href="#user-content-twice-1" class="wikilink">twice-1</a>`);
    expect(self).toContain(`<a href="#user-content-local-heading" class="wikilink">shown</a>`);
    expect(self).toContain(`<a href="${pageHref(WIKI, "Self.md")}" class="wikilink">Nowhere</a>`);
    expect(self).not.toContain("wikilink-unavailable");
  });
  it("H6 (TC-446): every same-page fragment lands on an id of that page, every cross-page fragment on an id of its target, and nothing is double-prefixed", () => {
    const pageIds = ids(self);
    const targetIds = ids(target);
    const all = hrefs(self);
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const href of all) {
      const hash = href.indexOf("#");
      if (hash < 0) continue;
      const fragment = href.slice(hash + 1);
      const into = hash === 0 ? pageIds : href.startsWith(base) ? targetIds : undefined;
      expect(into, href).toBeDefined();
      expect(into!.has(decodeURIComponent(fragment)), href).toBe(true);
      expect(fragment.startsWith(CLOBBER_PREFIX)).toBe(true);
      expect(fragment.startsWith(`${CLOBBER_PREFIX}${CLOBBER_PREFIX}`)).toBe(false);
    }
    expect(self).not.toContain(`${CLOBBER_PREFIX}${CLOBBER_PREFIX}`);
    expect(all.filter((h) => h.includes("#")).length).toBeGreaterThanOrEqual(8);
  });
  it("a non-ASCII and punctuated heading link resolves through the one slug function", () => {
    expect(self).toContain(`href="${base}#user-content-ünï-heading-punct"`);
    expect(ids(target).has("user-content-ünï-heading-punct")).toBe(true);
  });
  it("the same-page link inside an author anchor stays plain text (no nested anchor)", () => {
    const out = html(snapshot({ "p.md": "# H\n\n<a href=\"https://x.com\">[[#H]]</a>" }), "p.md");
    expect(out).not.toContain("wikilink");
  });
  it("[[#H]] in a heading-less page stays safe; a same-page embed ![[#H]] is the unavailable marker (no note named)", () => {
    const embed = html(snapshot({ "p.md": "![[#H]]" }), "p.md");
    expect(embed).toContain('class="wikilink-unavailable"');
    expect(embed).not.toContain("<a");
    expect(html(snapshot({ "p.md": "[[#Nope]]" }), "p.md")).toBe(`<p><a href="${pageHref(WIKI, "p.md")}" class="wikilink">Nope</a></p>`);
  });
});
