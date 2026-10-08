/**
 * US-219 (FR-053, SA-MOD Rendering pipeline E3-A1..A5, ADR-008 amendment 2026-10-07): the one heading predicate, the anchors the
 * pipeline appends, and the outline read from the final sanitised hast. TC-505 (one id for the entry, the anchor and the
 * wikilink), TC-508 (an author cannot forge an anchor or collide with an id).
 */
import type { Element, Root } from "hast";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { headingAnchorLabel } from "./heading-anchor-copy";
import { collectOutline, HEADING_ANCHOR_CLASS, isOutlineHeading, plainText } from "./heading-outline";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { CLOBBER_PREFIX, sanitizeSchema } from "./sanitize-schema";
import { RESERVED_CLASS_TOKENS } from "./strip-author-attrs";
import type { RenderedPage } from "./types";

const enc = new TextEncoder();
let n = 0;
function snapshot(entries: Record<string, string>): WikiSnapshot {
  const files = new Map<string, FileEntry>(Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]));
  const pages = parsePages(files);
  const sha = `sha-outline-${n++}`;
  return { wikiId: "wiki-outline", sha, files, pages, linkMap: buildLinkMap(pages, files, "wiki-outline", sha), searchIndexJson: "", tree: [] };
}
function render(entries: Record<string, string>, path: string): { page: RenderedPage; html: string } {
  const r = renderPage(snapshot(entries), path);
  if ("state" in r) throw new Error("unavailable");
  return { page: r, html: renderToStaticMarkup(r.content) };
}
const anchors = (html: string) => [...html.matchAll(/<a class="heading-anchor" href="([^"]*)"/g)].map((m) => m[1]!);
const ids = (html: string) => [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);

beforeEach(() => resetRenderCacheForTests());

const el = (tagName: string, properties: Element["properties"], children: Element["children"] = [{ type: "text", value: "Text" }]): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

describe("isOutlineHeading (E3-D2): the one predicate", () => {
  const root: Root = { type: "root", children: [] };
  it("accepts an h2 and an h3 with an id and text", () => {
    expect(isOutlineHeading(el("h2", { id: "a" }), [root])).toBe(true);
    expect(isOutlineHeading(el("h3", { id: "a" }), [root])).toBe(true);
  });
  it("excludes h1 and h4 to h6, whatever they carry", () => {
    for (const tag of ["h1", "h4", "h5", "h6"]) expect(isOutlineHeading(el(tag, { id: "a" }), [root])).toBe(false);
  });
  it("excludes a heading with no id, an empty id, or a non-string id", () => {
    expect(isOutlineHeading(el("h2", {}), [root])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: "" }), [root])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: ["a"] as unknown as string }), [root])).toBe(false);
  });
  it("excludes the footnotes heading (sr-only) and a heading with no plain text", () => {
    expect(isOutlineHeading(el("h2", { id: "footnote-label", className: ["sr-only"] }), [root])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: "a" }, []), [root])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: "a" }, [{ type: "text", value: " \n\t " }]), [root])).toBe(false);
  });
  it("excludes a heading inside an embedded note or an embed marker, at any depth", () => {
    const embed = el("div", { className: ["note-embed"] });
    const inner = el("blockquote", {});
    expect(isOutlineHeading(el("h2", { id: "a" }), [root, embed])).toBe(false);
    expect(isOutlineHeading(el("h3", { id: "a" }), [root, embed, inner])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: "a" }), [root, el("div", { className: ["embed-marker"] })])).toBe(false);
    expect(isOutlineHeading(el("h2", { id: "a" }), [root, el("div", { className: ["other"] })])).toBe(true);
  });
});

describe("plainText", () => {
  it("is the text with markup gone and whitespace collapsed", () => {
    const node = el("h2", {}, [
      { type: "text", value: "Use  " },
      el("code", {}, [{ type: "text", value: "retry()" }]),
      { type: "text", value: "\nwith " },
      el("em", {}, [{ type: "text", value: "care" }]),
    ]);
    expect(plainText(node)).toBe("Use retry() with care");
  });
});

describe("headingAnchorLabel (ruled copy)", () => {
  it("is Copy link to \"<heading>\" and is never cut", () => {
    expect(headingAnchorLabel("Decision")).toBe('Copy link to "Decision"');
    const long = "x".repeat(300);
    expect(headingAnchorLabel(long)).toBe(`Copy link to "${long}"`);
  });
  it("keeps a $ pattern in a heading literal", () => {
    expect(headingAnchorLabel("Cost $& $1 $$")).toBe('Copy link to "Cost $& $1 $$"');
  });
});

describe("anchors and outline from renderPage (TC-505)", () => {
  const PAGE = [
    "# Fixture",
    "",
    "## Setup",
    "",
    "## Setup",
    "",
    "## Use `retry()` with *care* and [docs](https://example.com)",
    "",
    "### Setup",
    "",
    "#### Deeper",
    "",
    "Body [[Fixture#Setup]] and [[Fixture#Use retry() with care and docs]].",
  ].join("\n");
  const { page, html } = render({ "Fixture.md": PAGE }, "Fixture.md");

  it("lists h2 and h3 only, in order, with plain-text entries", () => {
    expect(page.outline.map((e) => [e.depth, e.text])).toEqual([
      [2, "Setup"],
      [2, "Setup"],
      [2, "Use retry() with care and docs"],
      [3, "Setup"],
    ]);
  });
  it("gives every entry the final id: it exists on exactly one element and no two entries share one", () => {
    const all = ids(html);
    const entryIds = page.outline.map((e) => e.id);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    for (const id of entryIds) expect(all.filter((x) => x === id)).toHaveLength(1);
    expect(entryIds.slice(0, 2)).toEqual([`${CLOBBER_PREFIX}setup`, `${CLOBBER_PREFIX}setup-1`]);
  });
  it("puts one anchor on each entry's heading with the same id in its href, and none elsewhere", () => {
    expect(anchors(html)).toEqual(page.outline.map((e) => `#${e.id}`));
    expect(html).not.toMatch(/<h[1456][^>]*>[^<]*<a class="heading-anchor"/);
  });
  it("names the anchor Copy link to \"<heading>\" from the plain text", () => {
    expect(html).toContain('aria-label="Copy link to &quot;Use retry() with care and docs&quot;"');
    expect(html).toContain('<a class="heading-anchor" href="#user-content-setup" aria-label="Copy link to &quot;Setup&quot;"></a>');
  });
  it("slug identity: every parse-time h2/h3 entry has an outline entry with id CLOBBER_PREFIX + slug", () => {
    const parsed = page.headings.filter((h) => h.depth === 2 || h.depth === 3);
    expect(parsed).toHaveLength(page.outline.length);
    parsed.forEach((h, i) => expect(page.outline[i]!.id).toBe(CLOBBER_PREFIX + h.slug));
  });
  it("the wikilinks land on the same ids the entries carry", () => {
    const hrefs = [...html.matchAll(/<a href="[^"#]*#([^"]*)" class="wikilink"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([`${CLOBBER_PREFIX}setup`, page.outline[2]!.id]);
  });
  it("is frozen with the page (shared, cached)", () => {
    expect(Object.isFrozen(page.outline)).toBe(true);
    expect(Object.isFrozen(page.outline[0])).toBe(true);
  });
});

describe("exclusions (E3-D2, operator \"Exclude embedded headings\")", () => {
  it("an embedded note's headings and a footnotes heading get no anchor and no entry; the host's own do", () => {
    const { page, html } = render(
      {
        "Host.md": "# Host\n\n## Own one\n\nSee note[^1].\n\n![[Other]]\n\n### Own two\n\n[^1]: A note.\n",
        "Other.md": "# Other\n\n## Embedded section\n\n### Embedded sub\n",
      },
      "Host.md",
    );
    expect(page.outline.map((e) => e.text)).toEqual(["Own one", "Own two"]);
    expect(anchors(html)).toHaveLength(2);
    expect(html).toContain("Embedded section");
    expect(html).not.toContain("footnote-label\"><a");
  });
  it("a raw-HTML heading without an id gets neither; with an id it is one of the page's own", () => {
    const { page, html } = render({ "P.md": "# P\n\n<h2>No id</h2>\n\n<h2 id=\"mine\">Has id</h2>\n\n## Md\n" }, "P.md");
    expect(page.outline.map((e) => e.text)).toEqual(["Has id", "Md"]);
    expect(html).toMatch(/<h2>No id<\/h2>/);
    expect(anchors(html)).toEqual([`#${CLOBBER_PREFIX}mine`, `#${CLOBBER_PREFIX}md`]);
  });
  it("a page with no headings has an empty outline", () => {
    expect(render({ "P.md": "just text" }, "P.md").page.outline).toEqual([]);
  });
});

describe("author HTML cannot forge an anchor or collide with an id (TC-508)", () => {
  const HOSTILE = [
    "# T",
    "",
    '<a class="heading-anchor" href="https://evil.example">x</a>',
    "",
    '<a class="note heading-anchor" href="#user-content-setup">y</a>',
    "",
    '<div class="heading-anchor">z</div>',
    "",
    '<h2 id="setup">Raw</h2>',
    "",
    "## Setup",
    "",
    '<h3 id="user-content-setup">Raw prefixed</h3>',
    "",
    '## Say "hi" <b onclick="alert(1)">bold</b>',
  ].join("\n");
  const { page, html } = render({ "H.md": HOSTILE }, "H.md");

  it("no author element keeps the class; only pipeline anchors carry it, one per outline entry", () => {
    expect(anchors(html)).toEqual(page.outline.map((e) => `#${e.id}`));
    expect(html.match(/heading-anchor/g)).toHaveLength(page.outline.length);
    expect(html).toContain('href="https://evil.example"');
    expect(html).not.toMatch(/<div class="heading-anchor"/);
    // The author's second anchor loses the reserved token (and the sanitiser drops its other class); it stays an ordinary link.
    expect(html).toMatch(/<a class="" href="#[^"]*">y<\/a>/);
  });
  it("the Markdown ## Setup is renamed and its entry and anchor hold the renamed id, not the author's", () => {
    const setup = page.outline.find((e) => e.text === "Setup")!;
    expect(setup.id).not.toBe(`${CLOBBER_PREFIX}setup`);
    expect(setup.id).toMatch(/^user-content-setup-dup-\d+$/);
    expect(anchors(html)).toContain(`#${setup.id}`);
  });
  it("no id is duplicated and every outline id is in the output", () => {
    const all = ids(html);
    expect(new Set(all).size).toBe(all.length);
    for (const e of page.outline) expect(all).toContain(e.id);
  });
  it("hostile heading text is escaped text in the label and the entry, never markup", () => {
    expect(html).not.toMatch(/ onclick=/);
    const hostile = page.outline.find((e) => e.text.startsWith("Say"))!;
    expect(hostile.text).toBe('Say "hi" bold');
    expect(html).toContain('aria-label="Copy link to &quot;Say &quot;hi&quot; bold&quot;"');
  });
  it("the token is reserved, so the strip step is what refuses the look-alike (M1)", () => {
    expect(RESERVED_CLASS_TOKENS).toContain(HEADING_ANCHOR_CLASS);
  });
});

describe("sanitiser schema pin (ADR-008 amendment 2026-10-07)", () => {
  const a = sanitizeSchema.attributes?.a ?? [];
  it("admits exactly one new class token on a, in the one merged className entry", () => {
    const classNames = a.filter((e) => Array.isArray(e) && e[0] === "className");
    expect(classNames).toEqual([["className", "data-footnote-backref", "wikilink", "external-link", "heading-anchor"]]);
  });
  it("keeps ariaLabel on a (measured on the cloned schema: it is the a entry's own, not the wildcard's), so the anchor keeps its name", () => {
    expect(a).toContain("ariaLabel");
    expect(render({ "P.md": "# P\n\n## Sec\n" }, "P.md").html).toContain('aria-label="Copy link to &quot;Sec&quot;"');
  });
  it("adds no id, style or event attribute on a", () => {
    const names = a.map((e) => (Array.isArray(e) ? e[0] : e));
    expect(names).not.toContain("id");
    expect(names).not.toContain("style");
    expect(names.filter((x) => typeof x === "string" && x.startsWith("on"))).toEqual([]);
  });
});

describe("collectOutline reads the final hast", () => {
  it("lists only headings that carry the trusted anchor, with the id on the element", () => {
    const withAnchor = el("h2", { id: "user-content-a" }, [
      { type: "text", value: "A" },
      el("a", { className: [HEADING_ANCHOR_CLASS], href: "#user-content-a" }, []),
    ]);
    const without = el("h2", { id: "user-content-b" }, [{ type: "text", value: "B" }]);
    const h3 = el("h3", { id: "user-content-c" }, [
      { type: "text", value: "C" },
      el("a", { className: [HEADING_ANCHOR_CLASS], href: "#user-content-c" }, []),
    ]);
    expect(collectOutline({ type: "root", children: [withAnchor, without, h3] })).toEqual([
      { depth: 2, id: "user-content-a", text: "A" },
      { depth: 3, id: "user-content-c", text: "C" },
    ]);
  });
});
