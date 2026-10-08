import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import { pageHref } from "@/content/links/page-href";
import { pageHref as readerPageHref } from "@/components/reader/wiki-path";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { sanitizeSchema } from "./sanitize-schema";
import { RESERVED_CLASS_TOKENS } from "./strip-author-attrs";
import { WIKILINK_CLASS, WIKILINK_UNAVAILABLE_CLASS, wikilinkHandler } from "./wikilink";

const enc = new TextEncoder();
let n = 0;
const WIKI_ID = "wiki/1";
const OTHER = "notes/Other Note.md";

function snapshotOf(entries: Record<string, string>): WikiSnapshot {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]),
  );
  const pages = parsePages(files);
  const sha = `sha${n++}`;
  return { wikiId: WIKI_ID, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI_ID, sha), searchIndexJson: "", tree: [] };
}
/** Renders `body` as `p.md` next to `extra` pages (default: `notes/Other Note.md`). */
function html(body: string, extra: Record<string, string> = { [OTHER]: "# Other" }): string {
  const r = renderPage(snapshotOf({ ...extra, "p.md": body }), "p.md");
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}
const HREF = pageHref(WIKI_ID, OTHER);
/** The shared unavailable marker (W6-1) around `text`. */
const U = (text: string) =>
  `<span class="wikilink-unavailable" title="This link has no target in this wiki.">${text}<span class="wikilink-unavailable-indicator" aria-hidden="true"></span><span class="wikilink-unavailable-text">unavailable link</span></span>`;
const A = (text: string) => `<a href="${HREF}" class="wikilink">${text}</a>`;

beforeEach(() => resetRenderCacheForTests());

describe("page href: one implementation (W4-3)", () => {
  it("the reader's pageHref is the content-layer function", () => {
    expect(readerPageHref).toBe(pageHref);
  });
  it("the rendered href equals pageHref(wikiId, path) byte for byte, including an encoded id and path", () => {
    expect(HREF).toBe("/w/wiki%2F1/notes/Other%20Note.md");
    expect(html("[[Other Note]]")).toContain(`href="${HREF}"`);
  });
});

describe("bare links (L1, L2, L3)", () => {
  it("L1: [[Other Note]] is a.wikilink to the page with the target as text", () => {
    expect(html("[[Other Note]]")).toBe(`<p>${A("Other Note")}</p>`);
  });
  it("L2: case-folded", () => {
    expect(html("[[other note]]")).toBe(`<p>${A("other note")}</p>`);
  });
  it("L3: an ambiguous basename renders the non-link span", () => {
    const out = html("[[Dup]]", { "a/Dup.md": "#", "b/Dup.md": "#" });
    expect(out).toBe(`<p>${U("Dup")}</p>`);
    expect(out).not.toContain("<a");
  });
  it("a missing target renders the non-link span with the author's target text, no attribute carrying it", () => {
    const out = html("[[Missing Note]]");
    expect(out).toBe(`<p>${U("Missing Note")}</p>`);
  });
});

describe("path-qualified (L5, L6)", () => {
  const extra = { "folder/Note.md": "#", "folder-a/Notes.md": "#" };
  it("L5: with and without .md", () => {
    const href = pageHref(WIKI_ID, "folder/Note.md");
    expect(html("[[folder/Note]] [[folder/Note.md]]", extra)).toBe(
      `<p><a href="${href}" class="wikilink">folder/Note</a> <a href="${href}" class="wikilink">folder/Note.md</a></p>`,
    );
  });
  it("L5: a case mismatch is not found", () => {
    expect(html("[[Folder/Note]]", extra)).toBe(`<p>${U("Folder/Note")}</p>`);
  });
  it("L6: a path that exists only under another folder is not found", () => {
    const out = html("[[folder-b/Notes]]", extra);
    expect(out).not.toContain("<a");
    expect(out).not.toContain("folder-a");
  });
});

describe("display text (L7, L8, L9)", () => {
  it("L7: [[Other Note|shown text]] shows exactly the display text", () => {
    expect(html("[[Other Note|shown text]]")).toBe(`<p>${A("shown text")}</p>`);
  });
  it("L8: [[Missing Note|text]] leaks the target nowhere in the page HTML and is not an anchor", () => {
    const out = html("[[Missing Note|text]]");
    expect(out).toContain("text");
    expect(out).not.toContain("Missing");
    expect(out).not.toContain("<a");
    expect(out).toBe(`<p>${U("text")}</p>`);
  });
  it("L9: [[Note#Heading]] links to the page with no fragment, shown as `Note > Heading`", () => {
    const out = html("[[Other Note#Some Heading]]");
    expect(out).toBe(`<p>${A("Other Note &gt; Some Heading")}</p>`);
    expect(out).not.toContain("#");
  });
  it("a piped link with a heading shows the display text", () => {
    expect(html("[[Other Note#Some Heading|go]]")).toBe(`<p>${A("go")}</p>`);
  });
});

describe("image embeds are images (US-084, L10, W7-4; replaces the W6-7 literal)", () => {
  it("![[img.png]] is an img; an embed of a file that is not there is the image marker; neither is an a (note embeds: embeds.test.ts)", () => {
    const out = html("![[img.png]] ![[other.pdf]]", { [OTHER]: "#", "img.png": "x" });
    // (React 19 hoists a `<link rel="preload" as="image">` ahead of the markup for each img.)
    expect(out.replace(/^<link [^>]*\/>/, "")).toMatch(/^<p><img src="\/api\/wikis\/[^/"]+\/asset\/[^/"]+\/img.png" alt="img"\/> <span class="wikilink-unavailable">Image unavailable<span [^>]*><\/span><\/span><\/p>$/);
    expect(out).not.toContain("<a ");
  });
});

describe("recogniser in the page (S1 to S5)", () => {
  it("S1: only the real link outside code becomes an anchor", () => {
    const out = html("`[[Other Note]]`\n\n```\n[[Other Note]]\n```\n\n[[Other Note]]");
    expect(out.match(/<a /g)).toHaveLength(1);
    expect(out).toContain("<code>[[Other Note]]</code>");
    expect(out).toContain("[[Other Note]]\n</code>");
  });
  it("S2: indented code, an HTML comment, front matter and a link's text stay literal", () => {
    const out = html("---\nk: '[[Other Note]]'\n---\n\n    [[Other Note]]\n\n<!-- [[Other Note]] -->\n\n[[[Other Note]]](x.md)");
    expect(out).not.toContain(HREF);
    expect(out).toContain("[[Other Note]]");
    // What `[[[Other Note]]](x.md)` renders: an ordinary Markdown link to x.md whose text is the literal `[[Other Note]]`.
    // Wave 7: `x.md` is resolved, and there is no such file, so the link is the unavailable marker with that same literal text.
    expect(out).toMatch(/<span class="wikilink-unavailable"[^>]*>\[\[Other Note\]\]</);
    expect(out).not.toContain('href=""');
  });
  it("S3: a link in a heading, list item, blockquote, callout title and table cell", () => {
    const out = html(
      ["# Head [[Other Note]]", "", "- item [[Other Note]]", "", "> quote [[Other Note]]", "", "> [!note] Title [[Other Note]]", "", "| a |", "|---|", "| [[Other Note]] |"].join("\n"),
    );
    expect(out).toContain(`<h1 id="user-content-head-other-note">Head ${A("Other Note")}</h1>`);
    expect(out).toContain(`<li>item ${A("Other Note")}</li>`);
    expect(out).toContain(`<blockquote>\n<p>quote ${A("Other Note")}</p>`);
    expect(out).toContain(`<div class="callout-title"><span class="callout-icon" aria-hidden="true"></span>Title ${A("Other Note")}</div>`);
    expect(out).toContain(`<td>${A("Other Note")}</td>`);
    expect(out.match(/<a /g)).toHaveLength(5);
  });
  it("S4: an escaped pipe in a table cell shows the display text; the unescaped form follows GFM and does not throw", () => {
    const out = html("| a | b |\n|---|---|\n| [[Other Note\\|shown text]] | [[Other Note|x]] |");
    expect(out).toContain(`<td>${A("shown text")}</td>`);
    expect(out).toContain("<td>[[Other Note</td>");
  });
  it("S5: malformed forms stay literal, later paragraphs survive, no empty-target anchor", () => {
    const out = html(["[[", "", "[[]]", "", "[[ ]]", "", "[[a]]]", "", "[[a[b]c]]", "", "[[a", "", "b]]", "", "after"].join("\n"));
    expect(out).toBe("<p>[[</p>\n<p>[[]]</p>\n<p>[[ ]]</p>\n<p>[[a]]]</p>\n<p>[[a[b]c]]</p>\n<p>[[a</p>\n<p>b]]</p>\n<p>after</p>");
    expect(out).not.toContain("<a");
  });
  it("a wikilink in a heading does not change the heading's slug or title text source", () => {
    const snap = snapshotOf({ [OTHER]: "#", "p.md": "# Head [[Other Note|shown]]" });
    expect(snap.pages.get("p.md")?.headings[0]).toMatchObject({ text: "Head shown", slug: "head-shown" });
  });
});

describe("security (X1, X2)", () => {
  it("X1: author-written reserved classes are removed; javascript: stays stripped", () => {
    const out = html('<a class="wikilink" href="javascript:alert(1)">x</a> <span class="wikilink-unavailable">y</span> <a class="wikilink" href="https://e.com">z</a>');
    // `javascript:` is blocked (plain text, no anchor); the author's reserved classes are gone, so the https link is an
    // ordinary external link with the wave 7 treatment and no `wikilink` class.
    expect(out).toBe(
      '<p>x <span>y</span> <a href="https://e.com" target="_blank" rel="noopener noreferrer" class="external-link">z<span class="external-link-icon" aria-hidden="true"></span><span class="external-link-text">(opens in a new tab)</span></a></p>',
    );
    expect(out).not.toContain("wikilink");
  });
  it("X1: both classes are reserved for authors and exact-listed in the schema", () => {
    expect(RESERVED_CLASS_TOKENS).toEqual(expect.arrayContaining([WIKILINK_CLASS, WIKILINK_UNAVAILABLE_CLASS]));
    const attrs = sanitizeSchema.attributes ?? {};
    expect(attrs.a).toContainEqual(["className", "data-footnote-backref", WIKILINK_CLASS, "external-link", "heading-anchor"]);
    expect(attrs.span).toContainEqual([
      "className", "line", "callout-icon", WIKILINK_UNAVAILABLE_CLASS, "wikilink-unavailable-indicator", "wikilink-unavailable-text",
      "external-link-icon", "external-link-text",
    ]);
  });
  it("X2: a hostile target is escaped text and reaches no attribute", () => {
    // Entities make the hostile text reach the recogniser as a text node (a raw `<img>` would be author HTML, which the
    // sanitiser owns, not the wikilink path).
    const payload = '"&gt;&lt;img src=x onerror=alert(1)&gt;';
    const out = html(`[[x${payload}]] [[Other Note|y${payload}]]`);
    expect(out).not.toContain("<img");
    expect(out).toBe(
      `<p>${U("x&quot;&gt;&lt;img src=x onerror=alert(1)&gt;")} ${A("y&quot;&gt;&lt;img src=x onerror=alert(1)&gt;")}</p>`,
    );
    expect(out.match(/href="/g)).toHaveLength(1);
    const raw = html('[[x"><img src=x onerror=alert(1)>]]');
    expect(raw).not.toContain("onerror");
    // The raw `<img src=x>` is author HTML: `x` is not a file, so wave 7 renders the image marker, never a link.
    expect(raw).not.toContain("<a ");
    expect(raw).not.toContain("href");
  });
  it("X2: a very long target is text only", () => {
    const long = "a".repeat(900);
    const out = html(`[[${long}]]`);
    expect(out).toBe(`<p>${U(long)}</p>`);
  });
});

describe("review pins", () => {
  it("a wikilink inside an author anchor is plain text, never a nested anchor", () => {
    const out = html("<a href=\"https://x.com\">[[Other Note]]</a> <a href=\"https://x.com\">[[Missing|shown]]</a>");
    const external = (text: string) =>
      `<a href="https://x.com" target="_blank" rel="noopener noreferrer" class="external-link">${text}<span class="external-link-icon" aria-hidden="true"></span><span class="external-link-text">(opens in a new tab)</span></a>`;
    expect(out).toBe(`<p>${external("Other Note")} ${external("shown")}</p>`);
    expect(out.match(/<a[ >]/g)).toHaveLength(2);
    expect(out).not.toContain("wikilink");
  });
  it("a raw author <trustedLink> element yields no trusted link", () => {
    const out = html("<trustedLink>plain</trustedLink> <trustedlink class=\"wikilink\">two</trustedlink>");
    expect(out).toBe("<p>plain two</p>");
  });
  it("the handler without a render context renders the label as text", () => {
    const file = { data: {} };
    const node = { type: "wikilink", value: "shown", target: "Other Note", embed: false, raw: "[[Other Note|shown]]" };
    const state = { options: { file } } as unknown as Parameters<typeof wikilinkHandler>[0];
    expect(wikilinkHandler(state, node as never, undefined)).toEqual({ type: "text", value: "shown" });
  });
  it("[[x#H|text]] with x missing leaks neither x nor H", () => {
    const out = html("[[xqz#Hqz|text]]");
    expect(out).toBe(`<p>${U("text")}</p>`);
    expect(out).not.toMatch(/xqz|Hqz/);
  });
});
