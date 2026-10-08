/**
 * S06 wave 7 rendered specs (US-085 R1 to R6, US-084 I1 to I7, the image marker twin; TC-220, TC-221, TC-222, TC-451 to
 * TC-455), through `renderPage` with a real `LinkMap`. The resolver half is `links/relative-links.test.ts`, the route is
 * `components/reader/asset-request.test.ts`.
 */
import http from "node:http";
import https from "node:https";
import { parseFragment } from "parse5";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import type { LinkMap } from "@/content/links/types";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { assertWellFormed } from "./html-fixtures.testing";
import { primeHighlighter } from "./highlighter";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { unavailableImageMarker, unavailableMarker } from "./unavailable";
import { EXTERNAL_NEW_TAB_COPY, IMAGE_UNAVAILABLE_COPY, UNAVAILABLE_LABEL, UNAVAILABLE_TOOLTIP } from "./wikilink-copy";

const enc = new TextEncoder();
const WIKI = "w1";
let n = 0;

function snapshotOf(entries: Record<string, string>, spy?: (map: LinkMap) => LinkMap): WikiSnapshot {
  const files = new Map<string, FileEntry>(Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]));
  const pages = parsePages(files);
  const sha = `sha${n++}`;
  const linkMap = buildLinkMap(pages, files, WIKI, sha);
  return { wikiId: WIKI, sha, files, pages, linkMap: spy ? spy(linkMap) : linkMap, searchIndexJson: "", tree: [] };
}
/** The page's markup without the `<link rel="preload" as="image">` React 19 hoists in front of each `img`. */
function html(entries: Record<string, string>, path = "p.md", spy?: (map: LinkMap) => LinkMap): { out: string; sha: string } {
  const snapshot = snapshotOf(entries, spy);
  const r = renderPage(snapshot, path);
  if ("state" in r) throw new Error("unavailable");
  const out = renderToStaticMarkup(r.content).replace(/<link rel="preload" as="image"[^>]*\/>/g, "");
  assertWellFormed(out);
  return { out, sha: snapshot.sha };
}
const page = (md: string, extra: Record<string, string> = {}, from = "p.md") => html({ ...extra, [from]: md }, from);

interface El {
  tag: string;
  attrs: Record<string, string>;
  text: string;
}
/** Every element of the markup, re-parsed once, with its attributes and text. */
function elements(markup: string): El[] {
  type P5 = { tagName?: string; nodeName: string; attrs?: { name: string; value: string }[]; childNodes?: P5[]; value?: string };
  const out: El[] = [];
  const textOf = (node: P5): string => (node.nodeName === "#text" ? (node.value ?? "") : (node.childNodes ?? []).map(textOf).join(""));
  const walk = (node: P5): void => {
    if (node.tagName) out.push({ tag: node.tagName, attrs: Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value])), text: textOf(node) });
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(parseFragment(markup) as unknown as P5);
  return out;
}
const anchors = (markup: string) => elements(markup).filter((e) => e.tag === "a");
const images = (markup: string) => elements(markup).filter((e) => e.tag === "img");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** The link marker, exactly as `unavailableMarker` writes it. */
const marker = (text: string) =>
  `<span class="wikilink-unavailable" title="${UNAVAILABLE_TOOLTIP}">${text}<span class="wikilink-unavailable-indicator" aria-hidden="true"></span><span class="wikilink-unavailable-text">${UNAVAILABLE_LABEL}</span></span>`;
/** The image marker, exactly as `unavailableImageMarker` writes it. */
const IMAGE_MARKER = `<span class="wikilink-unavailable">${IMAGE_UNAVAILABLE_COPY}<span class="wikilink-unavailable-indicator" aria-hidden="true"></span></span>`;
/** The external-link markup. */
const external = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer" class="external-link">${text}<span class="external-link-icon" aria-hidden="true"></span><span class="external-link-text">${EXTERNAL_NEW_TAB_COPY}</span></a>`;
const asset = (sha: string, path: string) => `/api/wikis/${WIKI}/asset/${sha}/${path}`;

beforeAll(async () => {
  await primeHighlighter();
});
beforeEach(() => resetRenderCacheForTests());

const FILES = {
  "docs/a.md": "# A",
  "guides/setup.md": "# Setup\n\n## Install\n",
  "docs/pic.png": "png",
  "docs/my pic.png": "png",
  "docs/doc.pdf": "pdf",
  "docs/b.md": "# B\n\n## Setup\n",
  "docs/My Page.md": "# My Page",
  "etc/passwd": "root",
  "AGENTS.md": "# Agents",
};

describe("R1, R2 (TC-455): relative links, rendered", () => {
  it("R1: [Guide](../guides/setup.md) from docs/a.md is the page URL, a plain internal anchor", () => {
    const { out } = page("[Guide](../guides/setup.md)", FILES, "docs/a.md");
    expect(out).toBe('<p><a href="/w/w1/guides/setup.md">Guide</a></p>');
  });
  it("R2: a fragment is written as #user-content-<slug>, and that id exists on the target page", () => {
    const { out } = page("[Setup](../guides/setup.md#install)", FILES, "docs/a.md");
    expect(anchors(out)[0]!.attrs.href).toBe("/w/w1/guides/setup.md#user-content-install");
    const target = html(FILES, "guides/setup.md").out;
    expect(target).toContain('id="user-content-install"');
  });
  it("R2: the fragment survives rehypeUniqueIds: the host has the same heading and an embed renames the embedded one", () => {
    const { out } = html(
      { "p.md": "## Install\n\n![[Other]]\n\n[Self](p.md#install)", "Other.md": "## Install\n\nbody" },
      "p.md",
    );
    expect(anchors(out).find((a) => a.text === "Self")!.attrs.href).toBe("/w/w1/p.md#user-content-install");
    const ids = elements(out).flatMap((e) => (e.attrs.id ? [e.attrs.id] : []));
    expect(ids).toContain("user-content-install");
    expect(ids).toContain("user-content-embed-1-install");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("R2: a query is stripped, %20 resolves after one decode, a link to an image file is the asset URL", () => {
    const { out, sha } = page("[q](b.md?q=1) [sp](My%20Page.md) [pic](pic.png) [pic2](my%20pic.png)", FILES, "docs/a.md");
    expect(anchors(out).map((a) => a.attrs.href)).toEqual(["/w/w1/docs/b.md", "/w/w1/docs/My%20Page.md", asset(sha, "docs/pic.png"), asset(sha, "docs/my%20pic.png")]);
  });
  it("R2, W7-1: a link to doc.pdf, a missing target and a link to nothing at all are the one marker, with the author's text and no href", () => {
    const { out } = page("[pdf](doc.pdf) [gone](missing.md) [none]()", FILES, "docs/a.md");
    expect(out).toBe(`<p>${marker("pdf")} ${marker("gone")} ${marker("none")}</p>`);
    expect(anchors(out)).toEqual([]);
  });
  it("R2: reference-style links resolve the same way", () => {
    const { out } = page("[x][r] and [y][s]\n\n[r]: ../guides/setup.md#install\n[s]: gone.md", FILES, "docs/a.md");
    expect(anchors(out)[0]!.attrs.href).toBe("/w/w1/guides/setup.md#user-content-install");
    expect(out).toContain(marker("y"));
  });
  it("a same-page #fragment is untouched by resolution and still prefixed (TR-019)", () => {
    const { out } = page("# Head\n\n[top](#head)", {}, "p.md");
    expect(anchors(out)[0]!.attrs.href).toBe("#user-content-head");
  });
  it("the vault's own links climb to the repository root", () => {
    const { out } = page("[a](../../AGENTS.md)", { ...FILES, "wiki/x/y.md": "" }, "wiki/x/y.md");
    expect(anchors(out)[0]!.attrs.href).toBe("/w/w1/AGENTS.md");
  });
  it("a wikilink and a relative link never get the external treatment", () => {
    const { out } = page("[[A]] [rel](b.md)", FILES, "docs/a.md");
    expect(out).not.toContain("external-link");
    expect(out).not.toContain("target=");
    expect(out).not.toContain("rel=");
  });
});

describe("R3 (TC-221): traversal renders the marker and no lookup is attempted", () => {
  const lookups: string[] = [];
  const spy = (map: LinkMap): LinkMap => {
    const wrap = <V>(m: ReadonlyMap<string, V>): ReadonlyMap<string, V> =>
      new Proxy(m, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target) as unknown;
          if ((prop === "get" || prop === "has") && typeof value === "function") {
            return (key: string) => {
              lookups.push(key);
              return (value as (k: string) => unknown).call(target, key);
            };
          }
          return typeof value === "function" ? (value as () => unknown).bind(target) : value;
        },
      });
    return {
      ...map,
      basenameIndexFolded: wrap(map.basenameIndexFolded),
      assetBasenameIndex: wrap(map.assetBasenameIndex),
      pathIndex: wrap(map.pathIndex),
      pathIndexNfc: wrap(map.pathIndexNfc),
      aliasIndex: wrap(map.aliasIndex),
      headingIndex: wrap(map.headingIndex),
    };
  };
  beforeEach(() => {
    lookups.length = 0;
  });
  const hrefs = [
    "../../../etc/passwd",
    "/etc/passwd",
    "%2e%2e/%2e%2e/%2e%2e/etc/passwd",
    "..%2f..%2f..%2fetc%2fpasswd",
    "%252e%252e%252f%252e%252e%252fetc%252fpasswd",
    "..%5c..%5c..%5cetc%5cpasswd",
    "a.md%00.png",
    "%2fetc%2fpasswd",
  ];
  for (const href of hrefs) {
    it(`[x](${href}) is the marker and no index is consulted`, () => {
      const { out } = html({ ...FILES, "docs/a.md": `[x](${href})` }, "docs/a.md", spy);
      expect(out).toBe(`<p>${marker("x")}</p>`);
      expect(lookups).toEqual([]);
    });
  }
  it("a raw <a> with a backslash path, and an angle-bracket destination, are the same", () => {
    for (const md of ['<a href="..\\..\\..\\etc\\passwd">x</a>', "[x](<../../../etc/passwd>)"]) {
      const { out } = html({ ...FILES, "docs/a.md": md }, "docs/a.md", spy);
      expect(out).toBe(`<p>${marker("x")}</p>`);
    }
    expect(lookups).toEqual([]);
  });
  it("an image with a traversal src is the image marker, with no lookup", () => {
    const { out } = html({ ...FILES, "docs/a.md": "![a](../../../etc/passwd) ![b](/etc/passwd)" }, "docs/a.md", spy);
    expect(out).toBe(`<p>${IMAGE_MARKER} ${IMAGE_MARKER}</p>`);
    expect(lookups).toEqual([]);
  });
});

describe("R4 (TC-222): a protocol-relative link is external", () => {
  it("[External](//example.com/path) is treated as external, written as https, with the new-tab treatment, and no lookup", () => {
    const { out } = page("[External](//example.com/path)", FILES, "docs/a.md");
    expect(out).toBe(`<p>${external("https://example.com/path", "External")}</p>`);
  });
  it("the backslash spelling is external too, never resolved as an internal path", () => {
    const { out } = page('<a href="\\\\example.com/p">x</a>', FILES, "docs/a.md");
    expect(anchors(out)[0]!.attrs.href).toBe("https://example.com/p");
  });
});

describe("R5 (TC-454): external links", () => {
  it("a Markdown https link is exactly this markup: target, rel, class, the CSS icon and the hidden copy", () => {
    const { out } = page("[Vendor site](https://example.com)");
    expect(out).toBe(`<p>${external("https://example.com", "Vendor site")}</p>`);
  });
  it("the hidden copy is the accepted R-7 text, and the icon is an empty aria-hidden span (no svg)", () => {
    expect(EXTERNAL_NEW_TAB_COPY).toBe("(opens in a new tab)");
    const { out } = page("[v](https://example.com)");
    expect(out).not.toContain("<svg");
    expect(elements(out).find((e) => e.attrs.class === "external-link-icon")).toMatchObject({ text: "", attrs: { "aria-hidden": "true" } });
  });
  it("every form of an external http(s) link gets exactly target=_blank and rel='noopener noreferrer' (TC-454 rows)", () => {
    const { out } = page(
      [
        "[v](https://example.com)",
        "<https://example.com>",
        "https://example.com",
        "[h](http://example.com/x)",
        '<a href="https://example.com" target="_blank">raw1</a>',
        '<a href="https://example.com" target="_blank" rel="opener">raw2</a>',
        '<a href="https://example.com" target="_top" rel="opener noreferrer" class="external-link x">raw3</a>',
        '<a href="https://example.com">raw4</a>',
      ].join(" "),
    );
    const found = anchors(out);
    expect(found).toHaveLength(8);
    for (const a of found) {
      expect(a.attrs.target, a.text).toBe("_blank");
      expect(a.attrs.rel, a.text).toBe("noopener noreferrer");
      expect(a.attrs.class, a.text).toBe("external-link");
    }
    expect(count(out, 'class="external-link-icon"')).toBe(8);
    expect(count(out, EXTERNAL_NEW_TAB_COPY)).toBe(8);
  });
  it("mailto gets neither attribute, no class and no icon; an author target on an internal or mailto anchor is removed", () => {
    const { out } = page('[m](mailto:a@b.test) <a href="mailto:c@d.test" target="_blank" rel="opener">m2</a> <a href="#x" target="_blank">s</a>');
    for (const a of anchors(out)) {
      expect(a.attrs.target).toBeUndefined();
      expect(a.attrs.rel).toBeUndefined();
      expect(a.attrs.class).toBeUndefined();
    }
    expect(out).not.toContain("external-link");
  });
  it("an author target on a relative link that resolves is removed; on one that does not, the marker replaces the anchor", () => {
    const { out } = page('<a href="b.md" target="_blank" rel="opener">ok</a> <a href="nope.md" target="_blank">no</a>', FILES, "docs/a.md");
    expect(out).toBe(`<p><a href="/w/w1/docs/b.md">ok</a> ${marker("no")}</p>`);
  });
  it("author-written external-link classes and a guessed nonce are not trusted", () => {
    const { out } = page('<span class="external-link-icon external-link-text">x</span> <a class="external-link" href="/w/w1/x" data-resolved-nonce="guess">y</a>', FILES, "docs/a.md");
    expect(out).toBe(`<p><span>x</span> ${marker("y")}</p>`);
  });
  it("an external link inside a heading and a list keeps the heading slug and structure", () => {
    const { out } = page("# Go [there](https://example.com)\n\n- [item](https://example.com)");
    expect(out).toContain('<h1 id="user-content-go-there">Go ');
    expect(anchors(out)).toHaveLength(2);
  });
});

describe("R6 (SR-006, TC-422): blocked schemes are text, never an href", () => {
  const markdown = [
    "[x](javascript:alert(1))",
    "[x](JAVASCRIPT:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](data:text/html;base64,AAAA)",
    "[x](DATA:text/html,x)",
    "[x](vbscript:msgbox(1))",
    "[x](&#x6A;avascript:alert(1))",
    "[x](ftp://example.com/f)",
  ];
  for (const md of markdown) {
    it(`${md} renders its text and no link`, () => {
      const { out } = page(md);
      expect(out).toBe("<p>x</p>");
    });
  }
  const raw = [
    '<a href=" JaVaScRiPt:alert(1)">x</a>',
    '<a href="\tjava\nscript:alert(1)">x</a>',
    '<a href="java&#9;script:alert(1)">x</a>',
    '<a href="data:text/html;base64,AAAA">x</a>',
    '<a href="VBScript:msgbox(1)">x</a>',
  ];
  for (const md of raw) {
    it(`${md.replace(/\n|\t/g, " ")} renders its text and no link`, () => {
      const { out } = page(md);
      expect(out).toBe("<p>x</p>");
      expect(out).not.toContain("href");
    });
  }
  it("the link text is kept with its formatting", () => {
    expect(page("[**bold** text](javascript:x)").out).toBe("<p><strong>bold</strong> text</p>");
  });
});

describe("I1 to I4 (TC-220, TC-451): image embeds", () => {
  const IMG = { "assets/sub/diagram.png": "png", "assets/diagram.png": "png", "Diagram Two.png": "png", "doc.pdf": "pdf" };
  it("I1: ![[diagram.png]] in a subfolder is an img with the asset URL and alt text", () => {
    const { out, sha } = page("![[diagram.png]]", { "assets/sub/diagram.png": "png" });
    expect(out).toBe(`<p><img src="${asset(sha, "assets/sub/diagram.png")}" alt="diagram"/></p>`);
  });
  it("I1: a path-qualified name resolves (NFC, exact case); a spaced name resolves", () => {
    const { out, sha } = page("![[assets/sub/diagram.png]] ![[Diagram Two.png]]", IMG);
    expect(images(out).map((i) => i.attrs.src)).toEqual([asset(sha, "assets/sub/diagram.png"), asset(sha, "Diagram%20Two.png")]);
  });
  it("I2: a missing image is 'Image unavailable', with no img and no file name in the DOM", () => {
    const { out } = page("![[missing.png]]");
    expect(out).toBe(`<p>${IMAGE_MARKER}</p>`);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("missing");
  });
  it("I2: the image marker has no link, no tabindex, no title and no reason", () => {
    const { out } = page("![[missing.png]]");
    expect(out).not.toMatch(/<a |href|tabindex|title=/i);
  });
  it("a bare name is exact case: a differently cased name is unavailable (TR-017)", () => {
    const { out } = page("![[DIAGRAM.png]]", IMG);
    expect(out).toBe(`<p>${IMAGE_MARKER}</p>`);
  });
  const ONE = { "assets/diagram.png": "png" };
  it("I3: |300 and |300x200 set width and height, digits only", () => {
    const { out } = page("![[diagram.png|300]] ![[diagram.png|300x200]]", ONE);
    const [a, b] = images(out);
    expect(a!.attrs).toMatchObject({ width: "300", alt: "diagram" });
    expect(a!.attrs.height).toBeUndefined();
    expect(b!.attrs).toMatchObject({ width: "300", height: "200" });
  });
  it('I3: |300px"onerror=x injects no attribute; the pipe text is the alt text', () => {
    const { out } = page('![[diagram.png|300px"onerror=x]] ![[diagram.png|alt text]] ![[diagram.png|300x]]', ONE);
    const [a, b, c] = images(out);
    expect(Object.keys(a!.attrs).sort()).toEqual(["alt", "src"]);
    expect(a!.attrs.alt).toBe('300px"onerror=x');
    expect(out).not.toMatch(/\sonerror=/);
    expect(b!.attrs.alt).toBe("alt text");
    expect(c!.attrs.alt).toBe("300x");
    expect(c!.attrs.width).toBeUndefined();
  });
  it("I3: an oversized number is alt text, not a width", () => {
    const { out } = page("![[diagram.png|99999999]]", ONE);
    expect(images(out)[0]!.attrs.width).toBeUndefined();
    expect(images(out)[0]!.attrs.alt).toBe("99999999");
  });
  it("TC-451: #page=2 is ignored; .png alone and an empty target never reach the asset route", () => {
    const { out, sha } = page("![[diagram.png#page=2]] ![[.png]] ![[|300]]", IMG);
    // diagram.png exists in two folders, so the bare name is ambiguous: the marker, never a pick (TR-016).
    expect(images(out)).toEqual([]);
    expect(sha).toBeTruthy();
    expect(count(out, IMAGE_MARKER)).toBe(2);
    expect(out).toContain("![[|300]]");
  });
  it("TC-451: a unique bare name with #page=2 resolves and ignores the fragment", () => {
    const { out, sha } = page("![[Diagram Two.png#page=2]]", IMG);
    expect(images(out)[0]!.attrs.src).toBe(asset(sha, "Diagram%20Two.png"));
  });
  it("I4 (TC-220): ![[note]] expands, ![[pic.png]] is an image, ![[doc.pdf]] is the marker", () => {
    const { out } = page("![[note]]\n\n![[pic.png]]\n\n![[doc.pdf]]", { "note.md": "note body", "pic.png": "png", "doc.pdf": "pdf" });
    expect(out).toContain('<div class="note-embed"><p>note body</p></div>');
    expect(images(out)).toHaveLength(1);
    expect(out).toContain(IMAGE_MARKER);
    expect(out).not.toContain("doc.pdf");
    expect(anchors(out)).toEqual([]);
  });
  it("I4 (TC-220 rows): diagram.png is the image, diagram and diagram.md are the note", () => {
    const files = { "diagram.png": "png", "diagram.md": "note body" };
    expect(images(page("![[diagram.png]]", files).out)).toHaveLength(1);
    expect(page("![[diagram]]", files).out).toContain("note-embed");
    expect(page("![[diagram.md]]", files).out).toContain("note-embed");
    expect(images(page("![[diagram]]", files).out)).toHaveLength(0);
  });
  it("an image embed takes nothing from the embed budget (150 images, then a real embed)", () => {
    const { out } = page(`${"![[pic.png]]\n\n".repeat(150)}![[Real]]`, { "pic.png": "png", "Real.md": "real-body" });
    expect(count(out, "<img ")).toBe(150);
    expect(out).toContain("real-body");
  });
  it("an image embed in a heading, emphasis and a table cell stays an inline img, well-formed", () => {
    const { out } = page("# H ![[pic.png]]\n\n*![[pic.png]]*\n\n| a |\n|---|\n| ![[pic.png]] |", { "pic.png": "png" });
    expect(images(out)).toHaveLength(3);
  });
});

describe("I5 (TC-453): standard relative Markdown images", () => {
  const FILESET = { "assets/pixel.png": "png", "docs/img/local.png": "png", "docs/img/my pic.png": "png", "docs/guide.md": "", "docs/other.md": "# Other" };
  it("I5: ![logo](assets/pixel.png) from the wiki root is the asset URL", () => {
    const { out, sha } = page("![logo](assets/pixel.png)", FILESET, "README.md");
    expect(out).toBe(`<p><img src="${asset(sha, "assets/pixel.png")}" alt="logo"/></p>`);
  });
  it("TC-453: a, b, c, d resolve to the asset route; e, f, g are the image marker; h follows the scheme rules; i is unchanged", () => {
    const md = [
      "![a](../assets/pixel.png)",
      "![b](img/local.png)",
      "![c](./img/local.png)",
      "![d](img/my%20pic.png)",
      "![e](missing.png)",
      "![f](../../../etc/passwd)",
      "![g](/assets/pixel.png)",
      "![h](data:image/png;base64,AAAA)",
      "![i](https://example.com/x.png)",
    ].join(" ");
    const { out, sha } = page(md, FILESET, "docs/guide.md");
    expect(images(out).map((i) => i.attrs.src)).toEqual([
      asset(sha, "assets/pixel.png"),
      asset(sha, "docs/img/local.png"),
      asset(sha, "docs/img/local.png"),
      asset(sha, "docs/img/my%20pic.png"),
      "https://example.com/x.png",
    ]);
    expect(count(out, IMAGE_MARKER)).toBe(4);
    expect(out).not.toContain("/w/w1/");
  });
  it("I5: a relative src that resolves to a page, or to a non-image file, is 'Image unavailable'", () => {
    const { out } = page("![p](other.md) ![d](doc.pdf)", { ...FILESET, "docs/doc.pdf": "pdf" }, "docs/guide.md");
    expect(out).toBe(`<p>${IMAGE_MARKER} ${IMAGE_MARKER}</p>`);
  });
  it("a reference-style image resolves too", () => {
    const { out, sha } = page("![logo][l]\n\n[l]: assets/pixel.png", FILESET, "README.md");
    expect(images(out)[0]!.attrs.src).toBe(asset(sha, "assets/pixel.png"));
  });
  it("a linked image keeps the anchor, and an unresolved one inside a link is just the marker text", () => {
    const { out } = page("[![a](missing.png)](https://example.com)", FILESET, "README.md");
    expect(anchors(out)).toHaveLength(1);
    expect(out).toContain(IMAGE_UNAVAILABLE_COPY);
  });
  it("a raw <img> is resolved the same way on the host page, and an absolute app path is not trusted", () => {
    const { out, sha } = page('<img src="assets/pixel.png" alt="r"> <img src="/api/wikis/w1/asset/x/y.png"> <img src="https://example.com/x.png">', FILESET, "README.md");
    expect(images(out).map((i) => i.attrs.src)).toEqual([asset(sha, "assets/pixel.png"), "https://example.com/x.png"]);
    expect(count(out, IMAGE_MARKER)).toBe(1);
  });
});

describe("uppercase schemes and protocol-relative images (review r1 minors)", () => {
  it("HTTPS:, Https: and MAILTO: links keep a live, lower-cased href; HTTPS: images keep their src; JAVASCRIPT: stays text", () => {
    const { out } = page("[a](HTTPS://x.com/P) [b](Https://x.com) [c](MAILTO:a@b.test) ![i](HTTPS://x.com/i.png) [j](JAVASCRIPT:alert(1))");
    expect(anchors(out).map((a) => a.attrs.href)).toEqual(["https://x.com/P", "https://x.com", "mailto:a@b.test"]);
    expect(anchors(out).slice(0, 2).every((a) => a.attrs.target === "_blank")).toBe(true);
    expect(anchors(out)[2]!.attrs.target).toBeUndefined();
    expect(images(out).map((i) => i.attrs.src)).toEqual(["https://x.com/i.png"]);
    expect(out).toContain("j</p>");
    expect(out).not.toMatch(/javascript/i);
  });
  it("a protocol-relative or backslash image src is https, browser-fetched, in Markdown and raw HTML", () => {
    // (In Markdown a doubled backslash is an escape, so the backslash spelling is only reachable in raw HTML.)
    const { out } = page('![a](//evil.test/x.png)\n\n<img src="//evil.test/z.png"> <img src="\\\\evil.test/w.png">');
    expect(images(out).map((i) => i.attrs.src)).toEqual(["https://evil.test/x.png", "https://evil.test/z.png", "https://evil.test/w.png"]);
  });
});

describe("I6 (TC-452, SR-008): an external image is the browser's, never the server's", () => {
  afterEach(() => vi.restoreAllMocks());
  it("the src is unchanged, and no fetch, http or https request is made while rendering", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const httpSpy = vi.spyOn(http, "request");
    const httpsSpy = vi.spyOn(https, "request");
    const httpGet = vi.spyOn(http, "get");
    const httpsGet = vi.spyOn(https, "get");
    const { out } = page("![x](https://example.com/p.png)\n\n![[diagram.png]]\n\n![y](//cdn.example.com/q.png)", { "diagram.png": "png" });
    expect(images(out).map((i) => i.attrs.src)[0]).toBe("https://example.com/p.png");
    expect(images(out).map((i) => i.attrs.src)[2]).toBe("https://cdn.example.com/q.png");
    for (const spy of [fetchSpy, httpSpy, httpsSpy, httpGet, httpsGet]) expect(spy).not.toHaveBeenCalled();
  });
});

describe("the image marker is one shape (W7-1, the U2 twin)", () => {
  it("unavailableMarker still takes one argument; the image variant takes none and no reason", () => {
    expect(unavailableMarker.length).toBe(1);
    expect(unavailableImageMarker.length).toBe(0);
  });
  it("not-found, traversal-rejected and wrong-type render byte-identical output (embed and Markdown)", () => {
    const files = { "docs/a.md": "", "docs/doc.pdf": "pdf", "docs/p.md": "# P", "etc/passwd": "x" };
    const variants = [
      "![[missing.png]]",
      "![[doc.pdf]]",
      "![x](missing.png)",
      "![x](../../../etc/passwd)",
      "![x](doc.pdf)",
      "![x](p.md)",
      "![x](data:image/png;base64,AA==)",
      '<img src="missing.png">',
    ];
    const outs = variants.map((md) => page(md, files, "docs/a.md").out);
    // (A lone raw <img> is a block-level html node, so it has no wrapping <p>.)
    for (const out of outs) expect(out.replace(/^<p>|<\/p>$/g, "")).toBe(IMAGE_MARKER);
  });
  it("the link marker twin: not-found, traversal and non-page are byte-identical for the same text", () => {
    const files = { "docs/a.md": "", "docs/doc.pdf": "pdf" };
    const outs = ["[t](missing.md)", "[t](../../../etc/passwd)", "[t](doc.pdf)", "[t](/etc/passwd)"].map((md) => page(md, files, "docs/a.md").out);
    for (const out of outs) expect(out).toBe(`<p>${marker("t")}</p>`);
  });
});

describe("I7 (TC-450 regression): images and links inside embedded notes", () => {
  it("an embedded note's relative image and link resolve against THE EMBEDDED NOTE's folder", () => {
    const files = {
      "host/p.md": "# Host\n\n![[Inner]]",
      "notes/Inner.md": "# Inner\n\n![pic](pic.png)\n\n[up](../host/p.md) [sib](Sibling.md)",
      "notes/pic.png": "png",
      "notes/Sibling.md": "# S",
      "host/pic.png": "wrong",
    };
    const { out, sha } = html(files, "host/p.md");
    expect(images(out)[0]!.attrs.src).toBe(asset(sha, "notes/pic.png"));
    expect(anchors(out).map((a) => a.attrs.href)).toEqual(["/w/w1/host/p.md", "/w/w1/notes/Sibling.md"]);
  });
  it("a raw relative <a> or <img> inside an embedded note cannot know its folder: the marker, never a guess", () => {
    const files = { "p.md": "![[Inner]]", "Inner.md": '# Inner\n\n<img src="pic.png"> <a href="p.md">back</a>', "pic.png": "png" };
    const { out } = html(files, "p.md");
    expect(images(out)).toEqual([]);
    expect(anchors(out)).toEqual([]);
    expect(out).toContain(IMAGE_MARKER);
    expect(out).toContain(marker("back"));
  });
  it("an external link inside an embedded note gets the treatment once", () => {
    const { out } = html({ "p.md": "![[Inner]]", "Inner.md": "[v](https://example.com)" }, "p.md");
    expect(count(out, 'class="external-link-icon"')).toBe(1);
    expect(anchors(out)[0]!.attrs).toMatchObject({ target: "_blank", rel: "noopener noreferrer" });
  });
  it("image markup in embeds keeps ids unique and the page well-formed", () => {
    const files = {
      "p.md": "## Part\n\n![[A]]\n\n![[B]]\n\n![x](pic.png) ![[pic.png|10x10]]",
      "A.md": "## Part\n\n![a](pic.png)\n\n[t](https://example.com)",
      "B.md": "## Part\n\n![[pic.png]]\n\n[[A]]",
      "pic.png": "png",
    };
    const { out } = html(files, "p.md");
    const ids = elements(out).flatMap((e) => (e.attrs.id ? [e.attrs.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(images(out)).toHaveLength(4);
  });
});
