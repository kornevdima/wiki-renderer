import { buildLinkMap } from "@/content/links/link-map";
import { parseFragment } from "parse5";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { CLOBBER_PREFIX, sanitizeSchema } from "./sanitize-schema";
import { defaultSchema } from "rehype-sanitize";

const enc = new TextEncoder();
let counter = 0;
/** Files a relative link or image in these specs can resolve to (wave 7: relative targets are resolved, not passed through). */
const EXTRA_FILES = ["img/b.png", "img/y.png", "docs/a.md"];
function snapshotOf(text: string): WikiSnapshot {
  const files = new Map<string, FileEntry>([["p.md", { bytes: enc.encode(text), contentType: "text/markdown" }]]);
  for (const path of EXTRA_FILES) files.set(path, { bytes: enc.encode("# x"), contentType: "x" });
  const sha = `s${counter++}`;
  const pages = parsePages(files);
  return { wikiId: "w", sha, files, pages, linkMap: buildLinkMap(pages, files, "w", sha), searchIndexJson: "", tree: [] };
}
function html(md: string): string {
  const r = renderPage(snapshotOf(md), "p.md");
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}

interface Node5 {
  nodeName: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node5[];
  content?: Node5;
}
/** Re-parses the serialised HTML once (a second parse is where mutation happens) and lists every element. */
function elements(markup: string): { tag: string; attrs: Record<string, string> }[] {
  const out: { tag: string; attrs: Record<string, string> }[] = [];
  const walk = (n: Node5) => {
    // React 19 adds `<link rel="preload" as="image">` for each <img> to static markup; it repeats the sanitised src.
    const isPreload = n.tagName === "link" && (n.attrs ?? []).some((a) => a.name === "as" && a.value === "image");
    if (n.tagName && !isPreload) out.push({ tag: n.tagName, attrs: Object.fromEntries((n.attrs ?? []).map((a) => [a.name, a.value])) });
    for (const c of n.childNodes ?? []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(parseFragment(markup) as unknown as Node5);
  return out;
}
const tags = (markup: string) => elements(markup).map((e) => e.tag);
function urlValues(markup: string): string[] {
  return elements(markup).flatMap((e) =>
    ["href", "src", "srcset", "action", "xlink:href", "formaction", "cite", "longdesc"].flatMap((k) => (k in e.attrs ? [e.attrs[k]!] : [])),
  );
}
/** Browser-style normalisation: strip control chars and whitespace, lowercase. */
function normalised(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000- ]/g, "").toLowerCase();
}
function assertSafe(markup: string): void {
  expect(markup).not.toMatch(/<script/i);
  for (const e of elements(markup)) {
    expect(e.tag).not.toBe("script");
    for (const k of Object.keys(e.attrs)) expect(k).not.toMatch(/^on/);
  }
  for (const v of urlValues(markup)) expect(normalised(v)).not.toMatch(/^(javascript|vbscript|data):/);
}

beforeEach(() => resetRenderCacheForTests());

describe("sanitiser: script (S1)", () => {
  it("removes the script element and its text, keeps the paragraph", () => {
    const out = html("before\n\n<script>alert(1)</script>\n\nafter");
    expect(tags(out)).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>before</p>");
    expect(out).toContain("<p>after</p>");
  });
  it("removes an inline script with its text", () => {
    const out = html("a <script>alert(1)</script> b");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("a ");
  });
});

describe("sanitiser: kept tags (S2)", () => {
  it("keeps details > summary and br, sup, sub, kbd", () => {
    const out = html("<details><summary>More</summary>body</details>\n\nx<br>y <sup>2</sup> <sub>i</sub> <kbd>Ctrl</kbd>");
    expect(out).toContain("<details><summary>More</summary>body</details>");
    for (const t of ["br", "sup", "sub", "kbd"]) expect(tags(out)).toContain(t);
  });
});

describe("sanitiser: javascript link (S3)", () => {
  it("leaves no javascript: href", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).toContain("click");
    expect(out).not.toMatch(/href="javascript/i);
    expect(urlValues(out)).toEqual([]);
  });
});

describe("sanitiser: handlers (S4)", () => {
  it("keeps details and drops onclick", () => {
    const out = html('<details onclick="alert(1)"><summary>x</summary></details>');
    expect(tags(out)).toContain("details");
    expect(out).not.toMatch(/onclick/i);
  });
});

describe("sanitiser: schemes on img and a (S5)", () => {
  it("drops data: and vbscript: consistently for raw HTML and Markdown, on src and href", () => {
    const out = html(
      [
        '<img src="data:image/png;base64,AAAA">',
        "",
        '<a href="vbscript:msgbox(1)">x</a>',
        "",
        "![x](data:image/png;base64,AAAA)",
        "",
        "[x](vbscript:msgbox(1))",
        "",
        '<a href="data:text/html;base64,PHNjcmlwdD4=">d</a>',
        "",
        '<img src="vbscript:msgbox(1)">',
      ].join("\n"),
    );
    expect(urlValues(out)).toEqual([]);
    assertSafe(out);
  });
  it("keeps https img src and http(s)/mailto/#frag href; relative targets resolve (wave 7: asset URL, page URL, or the marker)", () => {
    const out = html(
      '![a](https://ok.example/a.png) ![b](img/b.png) [h](http://x.example) [s](https://x.example) [m](mailto:a@b.example) [r](docs/a.md) [u](../b.md)\n\n<a href="#frag">f</a>',
    );
    expect(urlValues(out)).toEqual([
      "https://ok.example/a.png",
      "/api/wikis/w/asset/s" + (counter - 1) + "/img/b.png",
      "http://x.example",
      "https://x.example",
      "mailto:a@b.example",
      "/w/w/docs/a.md",
      `#${CLOBBER_PREFIX}frag`,
    ]);
    // `../b.md` from `p.md` climbs above the repository root: the marker, with no href.
    expect(out).toContain('<span class="wikilink-unavailable"');
  });
});

describe("sanitiser: TC-208 / TC-209 (S7)", () => {
  it("removes style, iframe, object, embed with their content", () => {
    const out = html(
      "a\n\n<style>body{display:none}</style>\n\n<iframe src=\"https://x.example\">frame text</iframe>\n\n<object data=\"x\">obj text</object>\n\n<embed src=\"https://x.example\">\n\nz",
    );
    for (const t of ["style", "iframe", "object", "embed"]) expect(tags(out)).not.toContain(t);
    for (const s of ["display:none", "frame text", "obj text"]) expect(out).not.toContain(s);
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>z</p>");
  });
  it("removes a style attribute from a kept tag and from every tag", () => {
    const out = html(
      '<details style="display:none"><summary style="color:red">s</summary></details>\n\n<p style="position:fixed;top:0">p</p>\n\n<img src="https://x.example/a.png" style="width:9999px">',
    );
    expect(tags(out)).toContain("details");
    expect(out).not.toMatch(/style/i);
  });
  it("W2-3 (US-190): `style` is allowlisted on `span` only, as the one Shiki colour pattern, and there is no `on*` attribute", () => {
    const withStyle = Object.entries(sanitizeSchema.attributes ?? {})
      .filter(([, l]) => l.some((e) => (Array.isArray(e) ? e[0] : e) === "style"))
      .map(([tag]) => tag);
    expect(withStyle).toEqual(["span"]);
    const names = Object.values(sanitizeSchema.attributes ?? {}).flatMap((l) => l.map((e) => (Array.isArray(e) ? e[0] : e)));
    expect(names.some((n) => /^on/i.test(n))).toBe(false);
  });
});

describe("sanitiser: TC-422 obfuscated schemes (S8)", () => {
  const CASES: Record<string, string> = {
    "mixed case": "[x](JaVaScRiPt:alert(1))",
    "leading space": "[x]( javascript:alert(1))",
    "tab entity": '<a href="&#x09;javascript:alert(1)">x</a>',
    "control char": '<a href="\u0001javascript:alert(1)">x</a>',
    "embedded tab": '<a href="java\tscript:alert(1)">x</a>',
    "numeric entity": '<a href="&#106;avascript:alert(1)">x</a>',
    "named entity colon": '<a href="javascript&colon;alert(1)">x</a>',
    "data document": "[x](data:text/html;base64,PHNjcmlwdD4=)",
    vbscript: '<a href="VBScript:msgbox(1)">x</a>',
    "reference link": "[x][r]\n\n[r]: javascript:alert(1)",
    autolink: "<javascript:alert(1)>",
    "raw image": '<img src="JaVaScRiPt:alert(1)">',
    srcset: '<img srcset="javascript:alert(1) 1x" src="https://ok.example/a.png">',
    "picture source": '<picture><source srcset="javascript:alert(1)"><img src="https://ok.example/a.png"></picture>',
    action: '<div action="javascript:alert(1)">x</div>',
  };
  for (const [name, md] of Object.entries(CASES)) {
    it(`emits no live dangerous URL: ${name}`, () => {
      const out = html(`${md}\n\nend`);
      assertSafe(out);
      expect(out).toContain("end");
      expect(urlValues(out).filter((v) => /script|data:/i.test(v))).toEqual([]);
      expect(out).not.toMatch(/srcset|action=/i);
    });
  }
  it("keeps the link text of a dropped link as inert text", () => {
    expect(html("[visible text](JaVaScRiPt:alert(1))")).toContain("visible text");
  });
  it("keeps https, mailto, relative and #frag next to the attack", () => {
    const out = html("[a](JaVaScRiPt:x) [b](https://ok.example) [c](mailto:a@b.example) [d](docs/a.md) [e](../b.md) [f](#frag)");
    expect(urlValues(out)).toEqual(["https://ok.example", "mailto:a@b.example", "/w/w/docs/a.md", `#${CLOBBER_PREFIX}frag`]);
  });
});

describe("sanitiser: cite and longDesc (review r1)", () => {
  const CASES: Record<string, string> = {
    blockquote: '<blockquote cite="javascript:alert(1)">q</blockquote>',
    q: '<q cite="JaVaScRiPt:alert(1)">q</q>',
    del: '<del cite="vbscript:msgbox(1)">q</del>',
    longdesc: '<img longdesc="javascript:alert(1)" src="https://ok.example/a.png">',
  };
  for (const [name, md] of Object.entries(CASES)) {
    it(`leaves no dangerous URL: ${name}`, () => {
      const out = html(`${md}\n\nend`);
      assertSafe(out);
      expect(out).not.toMatch(/cite=|longdesc=/i);
    });
  }
  it("keeps an https cite", () => {
    expect(html('<blockquote cite="https://ok.example/s">q</blockquote>')).toContain('cite="https://ok.example/s"');
  });
});

describe("sanitiser: percent-encoded fragments and headers (review r1)", () => {
  it("prefixes a percent-encoded fragment verbatim (no decoding, so it targets no id)", () => {
    const out = html("## Setup\n\n[a](#%73etup) [b](#se%74up)");
    // The pipeline's own heading anchor (US-219) is not one of the author's two links.
    const hrefs = elements(out).filter((e) => e.tag === "a" && e.attrs.class !== "heading-anchor").map((e) => e.attrs.href);
    expect(hrefs).toEqual([`#${CLOBBER_PREFIX}%73etup`, `#${CLOBBER_PREFIX}se%74up`]);
    const ids = elements(out).flatMap((e) => (e.attrs.id ? [e.attrs.id] : []));
    for (const h of hrefs) expect(ids).not.toContain(h!.slice(1));
  });
  it("drops the headers attribute", () => {
    expect(html('<table><tr><td headers="x">c</td></tr></table>')).not.toMatch(/headers=/);
  });
});

describe("sanitiser: TC-423 dangerous elements and handlers (S9)", () => {
  const CASES: Record<string, string> = {
    svg: '<svg onload="alert(1)"><circle r="1"/></svg>',
    math: '<math><mi onload="alert(1)">x</mi></math>',
    form: '<form action="https://evil.example"><input name="q"><button>go</button></form>',
    base: '<base href="https://evil.example/">',
    meta: '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    link: '<link rel="stylesheet" href="https://evil.example/x.css">',
    ontoggle: "<details ontoggle=alert(1) open><summary>s</summary>b</details>",
  };
  for (const [name, md] of Object.entries(CASES)) {
    it(`removes ${name}`, () => {
      const out = html(`${md}\n\nend`);
      assertSafe(out);
      for (const t of ["svg", "math", "form", "base", "meta", "link", "button", "circle", "mi"]) {
        expect(tags(out)).not.toContain(t);
      }
      expect(out).not.toMatch(/evil\.example|http-equiv|action=/i);
      expect(out).toContain("end");
    });
  }
  it("keeps details when only the handler is removed", () => {
    expect(tags(html(CASES.ontoggle!))).toContain("details");
  });
});

describe("sanitiser: TC-424 mutation and clobbering (S10)", () => {
  const PAYLOADS = [
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "para\n\n<script",
    "<!--><script>alert(1)</script>-->",
    "para\n\n<img src=x onerror=alert(1)",
    '<a id="__NEXT_DATA__">x</a>',
    '<img name="cookie" src="https://ok.example/a.png">',
    '<a id="user-content-x" name="body">x</a>',
    "## \\_\\_next_data\\_\\_\n\ntext",
  ];
  for (const md of PAYLOADS) {
    it(`is clean after the render and after one re-parse: ${JSON.stringify(md).slice(0, 50)}`, () => {
      const out = html(md);
      assertSafe(out);
      for (const e of elements(out)) {
        for (const k of ["id", "name"]) {
          if (k in e.attrs) expect(e.attrs[k]!.startsWith(CLOBBER_PREFIX)).toBe(true);
        }
        expect(["__NEXT_DATA__", "cookie", "body"]).not.toContain(e.attrs.id);
        expect(["__NEXT_DATA__", "cookie", "body"]).not.toContain(e.attrs.name);
      }
    });
  }
  it("prefixes id and name and leaves no bare global", () => {
    const out = html('<a id="__NEXT_DATA__">x</a> <img name="cookie" src="https://ok.example/a.png"> <a id="user-content-x" name="body">x</a>');
    const attrs = elements(out).map((e) => e.attrs);
    expect(attrs.find((a) => a.id === `${CLOBBER_PREFIX}__NEXT_DATA__`)).toBeTruthy();
    expect(attrs.find((a) => a.name === `${CLOBBER_PREFIX}cookie`)).toBeTruthy();
    expect(attrs.find((a) => a.name === "body")).toBeUndefined();
    expect(elements(out).some((e) => e.attrs.id === "__NEXT_DATA__" || e.attrs.name === "cookie")).toBe(false);
  });
  it("double-prefixes an id that already starts with user-content- (documented library behaviour, TC-424 data)", () => {
    const out = html('<a id="user-content-x" name="body">x</a>');
    const a = elements(out).find((e) => e.tag === "a")!;
    expect(a.attrs.id).toBe(`${CLOBBER_PREFIX}${CLOBBER_PREFIX}x`);
    expect(a.attrs.name).toBe(`${CLOBBER_PREFIX}body`);
  });
  it("renders a heading slugged __next_data__ with the prefix", () => {
    expect(html("## \\_\\_next_data\\_\\_\n\ntext")).toContain(`<h2 id="${CLOBBER_PREFIX}__next_data__">`);
  });
  it("turns an unclosed tag at end of input into text or nothing and keeps the earlier content", () => {
    const out = html("keep me\n\n<img src=x onerror=alert(1)");
    expect(tags(out)).not.toContain("img");
    expect(out).toContain("keep me");
    expect(out).not.toMatch(/<img/);
  });
});

describe("sanitiser: prefix consistency (S11)", () => {
  it("prefixes de-duplicated heading ids while ParsedPage slugs stay bare", () => {
    const snap = snapshotOf("## Setup\n\na\n\n## Setup\n");
    const r = renderPage(snap, "p.md");
    if ("state" in r) throw new Error("unavailable");
    const out = renderToStaticMarkup(r.content);
    expect(out).toContain(`<h2 id="${CLOBBER_PREFIX}setup">`);
    expect(out).toContain(`<h2 id="${CLOBBER_PREFIX}setup-1">`);
    expect(r.headings.map((h) => h.slug)).toEqual(["setup", "setup-1"]);
    expect(snap.pages.get("p.md")!.headings.map((h) => h.slug)).toEqual(["setup", "setup-1"]);
  });
  it("makes an author #fragment link match its heading id", () => {
    const out = html("## Setup\n\n[go](#setup)");
    const els = elements(out);
    const href = els.find((e) => e.tag === "a")!.attrs.href!;
    expect(els.some((e) => e.attrs.id === href.slice(1))).toBe(true);
  });
  it("makes every footnote link href match a target id", () => {
    const out = html("Text[^1] more.\n\n[^1]: The note.");
    const els = elements(out);
    const ids = new Set(els.flatMap((e) => (e.attrs.id ? [e.attrs.id] : [])));
    const fragments = els.filter((e) => e.tag === "a" && e.attrs.href?.startsWith("#")).map((e) => e.attrs.href!.slice(1));
    expect(fragments.length).toBeGreaterThanOrEqual(2);
    for (const f of fragments) {
      expect(f.startsWith(CLOBBER_PREFIX)).toBe(true);
      expect(ids.has(f)).toBe(true);
    }
    expect(out).toContain("The note.");
  });
});

describe("sanitiser: regressions (S12)", () => {
  it("still renders a table and an https and a relative image", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n![x](https://ok.example/a.png)\n\n![y](img/y.png)");
    expect(tags(out)).toEqual(expect.arrayContaining(["table", "thead", "tbody", "th", "td"]));
    expect(urlValues(out)).toEqual(["https://ok.example/a.png", `/api/wikis/w/asset/s${counter - 1}/img/y.png`]);
  });
  it("keeps language-* on code and GFM task list inputs", () => {
    expect(html("```js\nx\n```")).toContain('class="language-js"');
    const t = html("- [x] done\n- [ ] todo");
    expect(t).toContain('type="checkbox"');
    expect(t).toContain("task-list-item");
  });
});

describe("sanitiser: schema (X2, X3)", () => {
  it("never mutates the library default schema", () => {
    expect(defaultSchema.protocols?.href).toContain("xmpp");
    expect(defaultSchema.strip).toEqual(["script"]);
    expect(defaultSchema.tagNames).toContain("source");
  });
  it("pins the protocol allowlist exactly, so a widening goes red", () => {
    expect(sanitizeSchema.protocols).toEqual({
      cite: ["http", "https"],
      href: ["http", "https", "mailto"],
      longDesc: ["http", "https"],
      src: ["http", "https"],
    });
  });
  it("keeps the SR-005 tags and none of the dangerous ones", () => {
    for (const t of ["details", "summary", "br", "sup", "sub", "kbd"]) expect(sanitizeSchema.tagNames).toContain(t);
    for (const t of ["script", "style", "iframe", "object", "embed", "form", "svg", "math", "picture", "source"]) {
      expect(sanitizeSchema.tagNames).not.toContain(t);
    }
  });
  it("US-189 (TC-503): `tabIndex` is allowlisted on `pre` (Shiki) and `table` only, as the exact value 0", () => {
    const entries = Object.entries(sanitizeSchema.attributes ?? {}).flatMap(([tag, list]) =>
      list.filter((e) => (Array.isArray(e) ? e[0] : e) === "tabIndex").map((e) => [tag, e] as const),
    );
    expect(entries.map(([tag]) => tag).sort()).toEqual(["pre", "table"]);
    for (const [, e] of entries) expect(e).toEqual(["tabIndex", 0]);
  });
  it("BUG-035: `align` is allowlisted on `*` only, as the exact values left/right/center/justify; no free-string align anywhere", () => {
    const entries = Object.entries(sanitizeSchema.attributes ?? {}).flatMap(([tag, list]) =>
      list.filter((e) => (Array.isArray(e) ? e[0] : e) === "align").map((e) => [tag, e] as const),
    );
    expect(entries.map(([tag]) => tag)).toEqual(["*"]);
    for (const [, e] of entries) expect(e).toEqual(["align", "left", "right", "center", "justify"]);
    expect(sanitizeSchema.attributes?.["*"]).not.toContain("align");
    expect(defaultSchema.attributes?.["*"]).toContain("align");
  });
  it("BUG-035: a free-string align on a cell never becomes inline CSS", () => {
    const out = html(
      '<table><tr><th align="left;position:fixed;inset:0;background:red">h</th><td align="center;background:url(x)">c</td><td align="LEFT">u</td><td align="right">r</td></tr></table>',
    );
    const cells = elements(out).filter((e) => e.tag === "th" || e.tag === "td");
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.attrs.style)).toEqual([undefined, undefined, undefined, "text-align:right"]);
    expect(out).not.toMatch(/position|background|url\(/);
    for (const e of elements(out)) if (e.tag !== "table") expect(e.attrs.style ?? "text-align:right").toBe("text-align:right");
  });
  it("BUG-035: an exact align keyword on p and div is kept as an inert attribute, with no style", () => {
    const els = elements(html('<p align="center">p</p><div align="center">d</div>'));
    const p = els.find((e) => e.tag === "p");
    const div = els.find((e) => e.tag === "div");
    expect(p?.attrs.align).toBe("center");
    expect(div?.attrs.align).toBe("center");
    expect(els.filter((e) => "style" in e.attrs)).toEqual([]);
  });
  it("BUG-035: a free-string align on p is dropped", () => {
    const els = elements(html('<p align="center;color:red">p</p>'));
    expect(els.filter((e) => "align" in e.attrs || "style" in e.attrs)).toEqual([]);
  });
  it("BUG-035: GFM column alignment still gives text-align left/center/right", () => {
    const out = html("| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |");
    const styles = elements(out).filter((e) => e.tag === "th").map((e) => e.attrs.style);
    expect(styles).toEqual(["text-align:left", "text-align:center", "text-align:right"]);
    expect(elements(out).filter((e) => e.tag === "td").map((e) => e.attrs.style)).toEqual(styles);
  });
  it("US-189 (TC-503): every table is one tab stop, and an author's tabindex on a table or anything else adds none", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n<table tabindex=\"-1\"><tr><td tabindex=\"0\">x</td></tr></table>\n\n<div tabindex=\"0\">d</div>\n\n<p tabindex=\"0\">p</p>");
    const focusable = elements(out).filter((e) => "tabindex" in e.attrs);
    expect(focusable.map((e) => e.tag)).toEqual(["table", "table"]);
    for (const e of focusable) expect(e.attrs.tabindex).toBe("0");
    expect(tags(out).filter((t) => t === "table")).toHaveLength(2);
  });
  it("US-189 fix round 1: abbr is allowed with `title` only, pinned exactly", () => {
    expect(sanitizeSchema.tagNames).toContain("abbr");
    expect(sanitizeSchema.attributes?.abbr).toEqual(["title"]);
    expect(defaultSchema.tagNames).not.toContain("abbr");
    const out = html('<abbr title="HyperText" class="x" style="color:red" id="a" onclick="x()" tabindex="0">HTML</abbr>');
    const abbr = elements(out).find((e) => e.tag === "abbr");
    expect(abbr?.attrs).toEqual({ title: "HyperText", id: `${CLOBBER_PREFIX}a` });
  });
  it("US-189 fix round 1: a plain fence is one tab stop, an author's tabindex on pre adds nothing else", () => {
    const out = html('```\nplain\n```\n\n<pre tabindex="-1">raw</pre>');
    const pres = elements(out).filter((e) => e.tag === "pre");
    expect(pres.length).toBeGreaterThanOrEqual(2);
    for (const p of pres) expect(p.attrs.tabindex).toBe("0");
  });
  it("US-189 fix round 1: input admits exactly disabled, type=checkbox and ariaLabelledBy", () => {
    expect(sanitizeSchema.attributes?.input).toEqual([["disabled", true], ["type", "checkbox"], "ariaLabelledBy"]);
  });
  it("US-189 fix round 1: each task checkbox is named by its item text with a matched, prefixed id", () => {
    const out = html("- [x] done thing\n- [ ] todo thing\n  - [ ] nested thing");
    const els = elements(out);
    const boxes = els.filter((e) => e.tag === "input");
    expect(boxes).toHaveLength(3);
    const names = boxes.map((b) => new RegExp(`<span id="${b.attrs["aria-labelledby"]}">([^<]*)</span>`).exec(out)?.[1]?.trim());
    expect(names).toEqual(["done thing", "todo thing", "nested thing"]);
    for (const b of boxes) expect(b.attrs["aria-labelledby"]!.startsWith(CLOBBER_PREFIX)).toBe(true);
  });
  it("US-189 fix round 2: an author aria-labelledby on an input is gone, with or without following text", () => {
    const bare = elements(html('<input type="checkbox" disabled aria-labelledby="evil">')).filter((e) => e.tag === "input");
    expect(bare).toHaveLength(1);
    expect(bare[0]!.attrs["aria-labelledby"]).toBeUndefined();
    const out = html('- [ ] <input type="checkbox" disabled aria-labelledby="evil"> after\n\n- [ ]\n');
    const boxes = elements(out).filter((e) => e.tag === "input");
    expect(out).not.toContain("evil");
    for (const b of boxes) {
      const v = b.attrs["aria-labelledby"];
      if (v !== undefined) expect(v).toMatch(new RegExp(`^${CLOBBER_PREFIX}task-label-\\d+$`));
    }
    const labelled = html("- [ ] hello").match(/aria-labelledby="([^"]+)"/);
    expect(labelled?.[1]).toMatch(/task-label-\d+$/);
  });
  it("uses the shared clobber prefix over id, name and the aria references", () => {
    expect(sanitizeSchema.clobberPrefix).toBe(CLOBBER_PREFIX);
    expect(sanitizeSchema.clobber).toEqual(["ariaDescribedBy", "ariaLabelledBy", "id", "name"]);
  });
});
