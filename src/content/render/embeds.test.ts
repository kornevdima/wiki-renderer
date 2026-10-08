/**
 * US-083 unit specs (contract M1 to M9; TC-218, TC-219, TC-449, TC-450), through `renderPage` with a real `LinkMap`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import { pageHref } from "@/content/links/page-href";
import { snapshotCacheStore } from "@/content/runtime/cache";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { EMBED_BUDGET, EMBED_DEPTH_CAP } from "./embed";
import { primeHighlighter } from "./highlighter";
import { parsePages } from "./parse";
import { assertWellFormed, blockParents } from "./html-fixtures.testing";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import type { RenderedPage } from "./types";
import { EMBED_BUDGET_COPY, EMBED_CYCLE_COPY, EMBED_DEPTH_COPY } from "./wikilink-copy";

const enc = new TextEncoder();
const WIKI = "w1";
let n = 0;

function snapshotOf(entries: Record<string, string>): WikiSnapshot {
  const files = new Map<string, FileEntry>(Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]));
  const pages = parsePages(files);
  const sha = `sha${n++}`;
  return { wikiId: WIKI, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI, sha), searchIndexJson: "", tree: [] };
}
function renderedOf(entries: Record<string, string>, path: string): RenderedPage {
  const r = renderPage(snapshotOf(entries), path);
  if ("state" in r) throw new Error("unavailable");
  return r;
}
function html(entries: Record<string, string>, path = "p.md"): string {
  const out = renderToStaticMarkup(renderedOf(entries, path).content);
  assertWellFormed(out);
  return out;
}
/** The external-link markup `links.ts` writes (wave 7, US-085): the treatment follows the link's own content. */
const ext = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer" class="external-link">${text}<span class="external-link-icon" aria-hidden="true"></span><span class="external-link-text">(opens in a new tab)</span></a>`;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const wrappers = (out: string) => count(out, 'class="note-embed"');

beforeAll(async () => {
  await primeHighlighter();
});
beforeEach(() => resetRenderCacheForTests());

describe("M1: an embed inlines the body", () => {
  it("wraps the note's body in div.note-embed, with no frontmatter and no second derived title", () => {
    const out = html({
      "p.md": "# Host\n\nBefore\n\n![[Other Note]]\n\nAfter",
      "Other Note.md": "---\ntitle: Derived Title\nsecret: frontmatter-value\n---\nThe other body.",
    });
    expect(out).toContain('<div class="note-embed"><p>The other body.</p></div>');
    expect(out).not.toContain("Derived Title");
    expect(out).not.toContain("frontmatter-value");
    expect(count(out, "<h1")).toBe(1);
    expect(out.indexOf("Before")).toBeLessThan(out.indexOf("The other body."));
    expect(out.indexOf("The other body.")).toBeLessThan(out.indexOf("After"));
  });
  it("an embed in the middle of a paragraph splits it: no block inside a p", () => {
    const out = html({ "p.md": "one ![[O]] two", "O.md": "# Inner" });
    expect(out.replace(/\n/g, "")).toBe('<p>one </p><div class="note-embed"><h1 id="user-content-embed-1-inner">Inner</h1></div><p> two</p>');
  });
  it("a section embed ![[Note#Heading]] embeds the whole note (OA-6)", () => {
    const out = html({ "p.md": "![[O#Two]]", "O.md": "# One\n\nfirst\n\n## Two\n\nsecond" });
    expect(out).toContain("first");
    expect(out).toContain("second");
  });
  it("an embed in a table cell and a list item expands, with a block parent", () => {
    const out = html({ "p.md": "| a |\n|---|\n| ![[O]] |\n\n- ![[O]]\n\n> quote ![[O]]\n\n> [!note] Title\n> ![[O]]", "O.md": "body" });
    expect(wrappers(out)).toBe(4);
    expect(out).toContain('<td><div class="note-embed"><p>body</p></div></td>');
    expect(blockParents(out)).toEqual([]);
  });
});

describe("M1b: an embed where a block is not valid degrades (review round 1)", () => {
  const O = { "O.md": "# Inner\n\ntext" };
  const link = '<a href="/w/w1/O.md" class="wikilink">O</a>';
  it("inside a heading it is the wikilink to the note, and nothing is nested in the h1", () => {
    const out = html({ "p.md": "# H ![[O]]", ...O });
    expect(out).toBe(`<h1 id="user-content-h-o">H ${link}</h1>`);
  });
  it("inside emphasis, strong and delete: no empty p or em, no loose text, no expansion", () => {
    const out = html({ "p.md": "*![[O]]* tail **![[O]]** ~~![[O]]~~", ...O });
    expect(out).toBe(`<p><em>${link}</em> tail <strong>${link}</strong> <del>${link}</del></p>`);
  });
  it("inside a link it is plain text, never a nested anchor (a Markdown link's text stays literal; an author <a> gets the text)", () => {
    expect(html({ "p.md": "[go ![[O]]](https://e.com)", ...O })).toBe(`<p>${ext("https://e.com", "go ![[O]]")}</p>`);
    expect(html({ "p.md": '<a href="https://e.com">![[O]]</a>', ...O })).toBe(`<p>${ext("https://e.com", "O")}</p>`);
  });
  it("a missing target in a heading or emphasis is the marker", () => {
    const out = html({ "p.md": "# H ![[Nope]]\n\n*![[Nope]]*" });
    expect(count(out, 'class="wikilink-unavailable"')).toBe(2);
    expect(out).not.toContain("<div");
  });
  it("a degraded embed takes nothing from the budget and is not a cycle", () => {
    const out = html({ "p.md": `${"# H ![[p]]\n\n".repeat(120)}![[O]]`, ...O }, "p.md");
    expect(wrappers(out)).toBe(1);
    expect(out).not.toContain(EMBED_BUDGET_COPY);
    expect(out).not.toContain(EMBED_CYCLE_COPY);
  });
  it("across a mixed page: block embeds only have flow parents", () => {
    const out = html({ "p.md": "# H ![[O]]\n\nx ![[O]] y *![[O]]*\n\n| a |\n|---|\n| ![[O]] |\n\n- ![[O]]\n\n![[Nope]]", ...O });
    expect(blockParents(out)).toEqual([]);
  });
});

describe("M1d: raw HTML in the paragraph degrades every embed in it (review round 2)", () => {
  const O = { "O.md": "# Inner\n\ntext" };
  const link = '<a href="/w/w1/O.md" class="wikilink">O</a>';
  const cases: [string, string][] = [
    ["<em>![[O]]</em> tail", `<p><em>${link}</em> tail</p>`],
    ["<b>x ![[O]] y</b>", `<p><b>x ${link} y</b></p>`],
    ["<span>![[O]]</span>", `<p><span>${link}</span></p>`],
    ["<a href=#x>![[O]]</a>", '<p><a href="#user-content-x">O</a></p>'],
  ];
  for (const [md, expected] of cases) {
    it(`${md} degrades, well-formed, nothing expanded`, () => {
      const out = html({ "p.md": md, ...O });
      expect(out).toBe(expected);
      expect(out).not.toContain("note-embed");
    });
  }
  it("a paragraph with <br> and an embed degrades", () => {
    const out = html({ "p.md": "line<br>![[O]]", ...O });
    expect(out).toContain(link);
    expect(out).not.toContain("note-embed");
    expect(out.match(/<p>/g)).toHaveLength(1);
  });
  it("a missing target in such a paragraph is the marker, and no budget is taken", () => {
    const out = html({ "p.md": `${"<i>![[O]]</i>\n\n".repeat(120)}![[O]]`, ...O });
    expect(wrappers(out)).toBe(1);
    expect(out).not.toContain(EMBED_BUDGET_COPY);
    expect(html({ "p.md": "<em>![[Nope]]</em>" })).toMatch(/<p><em><span class="wikilink-unavailable"/);
  });
  it("a paragraph with no raw HTML still expands", () => {
    expect(wrappers(html({ "p.md": "a ![[O]] b", ...O }))).toBe(1);
  });
});

describe("M1e: raw HTML in a table cell degrades the cell's embeds (review round 3)", () => {
  const O = { "O.md": "# Inner\n\ntext" };
  const table = (cell: string) => `| a |\n|---|\n| ${cell} |`;
  for (const cell of ["<b>x ![[O]] y</b>", "<em>![[O]]</em>"]) {
    it(`${cell} in a cell degrades, well-formed, no .note-embed`, () => {
      const out = html({ "p.md": table(cell), ...O });
      expect(out).not.toContain("note-embed");
      expect(out).toContain('<a href="/w/w1/O.md" class="wikilink">O</a>');
    });
  }
  it("a cell with no raw HTML still expands", () => {
    const out = html({ "p.md": table("x ![[O]]"), ...O });
    expect(wrappers(out)).toBe(1);
    expect(blockParents(out)).toEqual([]);
  });
});

describe("M1c: note versus attachment is decided by the link map (review round 1)", () => {
  it("![[my.note]] expands when my.note.md exists; ![[pic.png]] is an image; an unresolved non-md name is the image marker and a plain missing name is the link marker (W7-4)", () => {
    const out = html({ "p.md": "![[my.note]]\n\n![[pic.png]]\n\n![[gone.note]]\n\n![[gone]]", "my.note.md": "dotted body", "pic.png": "x" });
    expect(out).toContain('<div class="note-embed"><p>dotted body</p></div>');
    expect(out).toContain('<p><img src="/api/wikis/w1/asset/');
    expect(out).toContain('/pic.png" alt="pic"/></p>');
    expect(out).toMatch(/<p><span class="wikilink-unavailable">Image unavailable</);
    expect(out).not.toContain("gone.note");
    expect(out).toMatch(/<span class="wikilink-unavailable"[^>]*>gone</);
  });
});

describe("M6b: known limits, pinned so a change is deliberate (review round 1)", () => {
  function idsAndFragments(out: string) {
    const ids = [...out.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
    const fragments = [...out.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]!);
    return { ids, fragments };
  }
  it("a raw </div> in an embedded note closes the wrapper early: ids stay unique, every fragment lands on an id", () => {
    const out = renderToStaticMarkup(
      renderedOf({ "p.md": "![[X]]\n\n# Esc\n\n[host](#esc)", "X.md": "</div>\n\n# Esc" }, "p.md").content,
    );
    const { ids, fragments } = idsAndFragments(out);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of fragments) expect(ids).toContain(f);
  });
  it("a host author id equal to a generated one wins; the embedded element is renamed, ids stay unique and links land", () => {
    const out = html({ "p.md": '<h2 id="embed-1-inner">host</h2>\n\n![[O]]', "O.md": "# Inner\n\n[self](#inner)" }, "p.md");
    const { ids, fragments } = idsAndFragments(out);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of fragments) expect(ids).toContain(f);
    expect(ids).toContain("user-content-embed-1-inner-dup-1");
  });
});

describe("M1 (continued)", () => {
  it("the same note embedded twice expands twice (siblings do not share a visited set)", () => {
    const out = html({ "p.md": "![[O]]\n\n![[O]]", "O.md": "body" });
    expect(wrappers(out)).toBe(2);
    expect(out).not.toContain("embed-marker");
  });
});

describe("M2: a missing or ambiguous embed is the unavailable marker", () => {
  it("shows the author's embed text, as the shared marker", () => {
    const out = html({ "p.md": "![[Missing Note]]" });
    expect(out).toMatch(/<p><span class="wikilink-unavailable"[^>]*>Missing Note<span class="wikilink-unavailable-indicator" aria-hidden="true"><\/span>/);
    expect(out).not.toContain("note-embed");
    expect(out).not.toContain("<a");
  });
});

describe("M3: cycles (TC-219)", () => {
  it("A embeds B and B embeds A: each renders, with the cycle copy exactly once", () => {
    const entries = { "A.md": "a-body\n\n![[B]]", "B.md": "b-body\n\n![[A]]" };
    for (const path of ["A.md", "B.md"]) {
      resetRenderCacheForTests();
      const out = html(entries, path);
      expect(count(out, EMBED_CYCLE_COPY)).toBe(1);
      expect(wrappers(out)).toBe(1);
      expect(count(out, "a-body")).toBe(1);
      expect(count(out, "b-body")).toBe(1);
    }
  });
  it("a page that embeds itself renders the cycle marker once and expands nothing", () => {
    const out = html({ "SelfPage.md": "# SelfPage\n\n![[SelfPage]]" }, "SelfPage.md");
    expect(count(out, EMBED_CYCLE_COPY)).toBe(1);
    expect(wrappers(out)).toBe(0);
  });
  it("the cycle marker is one block div carrying the copy only: no name and no path", () => {
    const out = html({ "Secret Name.md": "![[Secret Name]]" }, "Secret Name.md");
    expect(out).toContain(`<div class="embed-marker">${EMBED_CYCLE_COPY}</div>`);
    expect(out.replace(/id="[^"]*"/g, "")).not.toMatch(/Secret|\.md/);
  });
});

function chain(pages: number): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < pages; i++) entries[`P${i}.md`] = i < pages - 1 ? `body-${i}\n\n![[P${i + 1}]]` : `body-${i}`;
  return entries;
}

describe("M4: the depth cap (TC-218)", () => {
  it("is 10 and the budget is 100 (named constants)", () => {
    expect(EMBED_DEPTH_CAP).toBe(10);
    expect(EMBED_BUDGET).toBe(100);
  });
  it("a chain of exactly 10 pages renders fully, with no marker", () => {
    const out = html(chain(10), "P0.md");
    for (let i = 0; i < 10; i++) expect(out).toContain(`body-${i}`);
    expect(out).not.toContain(EMBED_DEPTH_COPY);
    expect(wrappers(out)).toBe(9);
  });
  it("a chain of 11 pages stops at the 10th with exactly one depth marker in place of the 11th", () => {
    const out = html(chain(11), "P0.md");
    expect(out).toContain("body-9");
    expect(out).not.toContain("body-10");
    expect(count(out, EMBED_DEPTH_COPY)).toBe(1);
    expect(wrappers(out)).toBe(9);
  });
  it("a 15-deep chain stops at the cap, with no stack overflow", () => {
    const out = html(chain(15), "P0.md");
    expect(count(out, EMBED_DEPTH_COPY)).toBe(1);
    expect(out).not.toContain("body-10");
  });
});

describe("M5: the total budget (TC-449)", () => {
  /** A host that embeds `width` distinct small notes one after another. */
  function flat(width: number): Record<string, string> {
    const entries: Record<string, string> = {};
    const lines: string[] = [];
    for (let i = 0; i < width; i++) {
      entries[`N${i}.md`] = `flatbody-${i}`;
      lines.push(`![[N${i}]]`);
    }
    entries["p.md"] = lines.join("\n\n");
    return entries;
  }
  /** `levels` deep, every level embeds the next one `fan` times: a full expansion is fan^levels. */
  function tree(levels: number, fan: number): Record<string, string> {
    const entries: Record<string, string> = {};
    for (let i = 0; i < levels; i++) {
      entries[`L${i}.md`] = i < levels - 1 ? Array.from({ length: fan }, () => `![[L${i + 1}]]`).join("\n\n") : "leaf";
    }
    entries["p.md"] = "![[L0]]";
    return entries;
  }
  /** Wall-clock ceiling for the hostile fixtures (measured on the builder's machine well below it; TC-449 proposes 1 s). */
  const CEILING_MS = 1000;

  it("a wide page shows the first 100 expansions in document order and the budget copy for the rest", () => {
    const out = html(flat(130));
    expect(wrappers(out)).toBe(100);
    expect(count(out, EMBED_BUDGET_COPY)).toBe(30);
    let last = -1;
    for (let i = 0; i < 100; i++) {
      const at = out.indexOf(`flatbody-${i}<`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(out).not.toContain("flatbody-100<");
    // The first budget marker comes right after expansion 99, in document order.
    expect(out.indexOf(EMBED_BUDGET_COPY)).toBeGreaterThan(out.indexOf("flatbody-99<"));
  });
  it("a page that embeds 20 distinct small notes renders fully (no false limit)", () => {
    const out = html(flat(20));
    expect(wrappers(out)).toBe(20);
    expect(out).not.toContain(EMBED_BUDGET_COPY);
  });
  it("a binary tree 8 levels deep (256 leaves) expands at most 100 times, in bounded time", () => {
    const start = performance.now();
    const out = html(tree(8, 2));
    const ms = performance.now() - start;
    expect(wrappers(out)).toBe(EMBED_BUDGET);
    expect(out).toContain(EMBED_BUDGET_COPY);
    expect(ms).toBeLessThan(CEILING_MS);
  });
  // 6 levels, not TC-449's 10: unbounded that is ~19,500 expansions, so a regression turns this red in about a second
  // instead of hanging the run (10 levels at fan-out 5 is about 10 million).
  it("a fan-out of 5, 6 levels deep (about 19,500 expansions unbounded) is bounded the same way", () => {
    const start = performance.now();
    const out = html(tree(6, 5));
    const ms = performance.now() - start;
    expect(wrappers(out)).toBe(EMBED_BUDGET);
    expect(out).toContain(EMBED_BUDGET_COPY);
    expect(out.length).toBeLessThan(200_000);
    expect(ms).toBeLessThan(CEILING_MS);
  });
  it("the budget is one object per top-level render: a second render starts full, and a cached render does no work", () => {
    const snapshot = snapshotOf(flat(130));
    // US-058 D5: a render is cached only for the snapshot that is the wiki's cached one (budget set: no env in pure specs).
    snapshotCacheStore().set(snapshot.wikiId, { snapshot, sha: snapshot.sha, lastCheckedAt: 0 });
    const first = renderPage(snapshot, "p.md");
    const second = renderPage(snapshot, "p.md");
    expect(second).toBe(first);
    resetRenderCacheForTests();
    const again = renderPage(snapshot, "p.md");
    if ("state" in again) throw new Error("unavailable");
    expect(wrappers(renderToStaticMarkup(again.content))).toBe(100);
  });
});

describe("M6: ids stay unique when a note is embedded twice (TC-450)", () => {
  const X = [
    "---",
    "title: X",
    "---",
    "# Overview",
    "",
    "Text with a note.[^1] Jump to [[#Overview]] or [local](#overview).",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    '<div id="raw-id">raw</div>',
    "",
    "[^1]: The footnote.",
  ].join("\n");
  const entries = { "p.md": "# Overview\n\nHost text.[^h]\n\n![[X]]\n\n![[X]]\n\n[^h]: host footnote", "X.md": X };

  it("every id is unique and every same-page fragment lands on an id", () => {
    const r = renderedOf(entries, "p.md");
    const out = renderToStaticMarkup(r.content);
    const ids = [...out.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(8);
    expect(new Set(ids).size).toBe(ids.length);
    const fragments = [...out.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]!);
    expect(fragments.length).toBeGreaterThan(4);
    for (const f of fragments) expect(ids, `fragment #${f}`).toContain(f);
    for (const id of ids) expect(id.startsWith("user-content-")).toBe(true);
    // The aria references of the footnote marks land on an id too.
    for (const m of out.matchAll(/aria-describedby="([^"]*)"/g)) expect(ids).toContain(m[1]);
  });
  it("the host keeps its own heading id; each embed gets its own namespace", () => {
    const out = html(entries, "p.md");
    expect(out).toContain('id="user-content-overview"');
    expect(out).toContain('id="user-content-embed-1-overview"');
    expect(out).toContain('id="user-content-embed-2-overview"');
    expect(out).toContain('id="user-content-embed-1-raw-id"');
    expect(out).toContain('id="user-content-embed-2-raw-id"');
  });
  it("the Mermaid placeholders of both embeds are in the page's diagram set, with distinct ids", () => {
    const r = renderedOf(entries, "p.md");
    expect(r.mermaidBlocks).toHaveLength(2);
    expect(new Set(r.mermaidBlocks.map((b) => b.id)).size).toBe(2);
    const out = renderToStaticMarkup(r.content);
    for (const b of r.mermaidBlocks) expect(out).toContain(`data-mermaid-id="${b.id}"`);
  });
  it("an author id in the host that equals a generated one is separated, never shared", () => {
    const out = html({ "p.md": '<div id="embed-1-overview">x</div>\n\n![[X]]', "X.md": "# Overview" }, "p.md");
    const ids = [...out.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("nested embeds get their own namespaces too", () => {
    const out = html({ "p.md": "![[A]]", "A.md": "# Same\n\n![[B]]", "B.md": "# Same" }, "p.md");
    const ids = [...out.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
    expect(ids).toEqual(["user-content-embed-1-same", "user-content-embed-2-same"]);
  });
});

describe("M7: links inside an embedded note (W6-5)", () => {
  it("[[#H]] inside an embedded X is a cross-page link to X with X's heading slug", () => {
    const out = html({ "p.md": "![[X]]", "X.md": "# Heading H\n\n[[#Heading H]]" }, "p.md");
    expect(out).toContain(`<a href="${pageHref(WIKI, "X.md")}#user-content-heading-h" class="wikilink">Heading H</a>`);
    expect(out).not.toContain('href="#');
  });
  it("another wikilink in X resolves against the same link map, and a missing one is the marker", () => {
    const out = html({ "p.md": "![[X]]", "X.md": "[[Y]] [[Nope]]", "Y.md": "y" }, "p.md");
    expect(out).toContain(`href="${pageHref(WIKI, "Y.md")}"`);
    expect(out).toContain('class="wikilink-unavailable"');
  });
});

describe("M8: one Shiki budget across the host and its embeds", () => {
  // BUG-025: this test highlights 80k characters of Shiki and took 5,062 ms in Cloud Build a2eb8ac3 (shared
  // E2_HIGHCPU_8), over the 5 s default. The timeout is only the harness; the assertions are the claim.
  const BUG_025_TIMEOUT_MS = 15_000;
  const code = (size: number) => "```ts\n" + "const a = 1;\n".repeat(Math.floor(size / 13)) + "```";
  it("highlighting stops at the per-render budget across embeds and nothing throws", () => {
    const out = html({
      "p.md": `${code(40_000)}\n\n![[E1]]\n\n![[E2]]\n\n![[E3]]`,
      "E1.md": code(40_000),
      "E2.md": code(40_000),
      "E3.md": code(40_000),
    });
    // 100_000 characters in all: the host and the first embed fit, the next two render plain.
    expect(count(out, 'class="shiki')).toBe(2);
    expect(count(out, "language-ts")).toBe(2);
    expect(count(out, "<pre")).toBe(4);
  }, BUG_025_TIMEOUT_MS);
});

describe("M9: a non-Markdown embed target is an image, not a note (W7-4, replaces the W6-7 literal)", () => {
  it("![[pic.png]] is an img and no expansion is attempted (no budget taken, no wrapper)", () => {
    const entries: Record<string, string> = { "pic.png": "x", "p.md": `${"![[pic.png]]\n\n".repeat(150)}![[Real]]`, "Real.md": "real-body" };
    const out = html(entries, "p.md");
    expect(count(out, "<img ")).toBe(150);
    expect(out).not.toContain("![[pic.png]]");
    expect(wrappers(out)).toBe(1);
    expect(out).not.toContain(EMBED_BUDGET_COPY);
  });
  it("a dotted note name without an extension-like suffix is still a note", () => {
    const out = html({ "p.md": "![[Release 1.5]]", "Release 1.5.md": "notes" }, "p.md");
    expect(wrappers(out)).toBe(1);
  });
});

describe("the embed wrapper cannot be forged by an author", () => {
  it("an author div with the class, or with a guessed nonce attribute, is plain", () => {
    const out = html({ "p.md": '<div class="note-embed" data-embed-nonce="guess" id="mine">x</div>' });
    expect(out).toBe('<div id="user-content-mine">x</div>');
  });
  it("an author <a> around an embed gets plain text for the unavailable marker, never a nested anchor", () => {
    const out = html({ "p.md": '<a href="https://e.com">![[Nope]]</a>' });
    expect(out).toBe(`<p>${ext("https://e.com", "Nope")}</p>`);
  });
});
