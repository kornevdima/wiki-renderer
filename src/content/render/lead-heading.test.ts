/**
 * US-220 (SA-MOD Reader UI and print E3-D7): a page whose body opens with its own h1 hands the reader that heading alone as
 * `leadHeading`, so the meta line follows it; any other page has none. `leadHeading` then `body` is exactly `content`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildLinkMap } from "../links/link-map";
import type { FileEntry, WikiSnapshot } from "../runtime/types";
import { bodyStartsWithH1 } from "./body-starts-with-h1";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";

const enc = new TextEncoder();

function renderWithAst(text: string) {
  const files = new Map<string, FileEntry>([["p.md", { bytes: enc.encode(text), contentType: "text/markdown" }]]);
  const pages = parsePages(files);
  const snapshot: WikiSnapshot = { wikiId: "w1", sha: "abc", files, pages, linkMap: buildLinkMap(pages, files, "w1", "abc"), searchIndexJson: "", tree: [] };
  const r = renderPage(snapshot, "p.md");
  if ("state" in r) throw new Error("unavailable");
  return { r, ast: pages.get("p.md")!.ast };
}
const render = (text: string) => renderWithAst(text).r;
const html = (node: unknown) => renderToStaticMarkup(node as never);

beforeEach(() => resetRenderCacheForTests());

describe("leadHeading and body (US-220)", () => {
  it("a body that opens with an h1 splits into that heading and the rest, and together they are the content", () => {
    const r = render("---\ntitle: T\n---\n# Own title\n\nText with *em*.\n\n## Section\n\nMore.\n");
    expect(html(r.leadHeading)).toMatch(/^<h1 id="user-content-own-title">Own title<\/h1>\s*$/);
    expect(html(r.body)).not.toContain("<h1");
    expect(html(r.body)).toContain("<h2");
    expect(html(r.content)).toBe(html(r.leadHeading) + html(r.body));
  });

  it("a body that does not open with an h1 has no lead heading, and body is content", () => {
    const r = render("Intro first.\n\n# Later h1\n");
    expect(r.leadHeading).toBeNull();
    expect(html(r.body)).toBe(html(r.content));
    expect(html(r.content)).toContain("Intro first.");
  });

  it("an h2 first, or an empty body, has no lead heading", () => {
    expect(render("## Only h2\n").leadHeading).toBeNull();
    expect(render("---\ntitle: T\n---\n").leadHeading).toBeNull();
  });

  it("an h1 written as raw HTML is not the page's own heading, so no split", () => {
    expect(render("<h1>raw</h1>\n\ntext\n").leadHeading).toBeNull();
  });
});

describe("leadHeading agrees with bodyStartsWithH1 (US-220 review minor 2)", () => {
  const cases: Record<string, string> = {
    "plain h1": "# Own\n\ntext\n",
    "h1 after front matter": "---\ntitle: T\n---\n# Own\n\ntext\n",
    "leading blank lines": "\n\n\n# Own\n\ntext\n",
    "leading spaces before the marker": "   # Own\n\ntext\n",
    "front comment before the h1": "<!-- note -->\n# Own\n\ntext\n",
    "setext h1": "Own\n===\n\ntext\n",
    "setext h1 after front matter": "---\ntitle: T\n---\nOwn\n===\n\ntext\n",
    "h2 first": "## Own\n\ntext\n",
    "setext h2 first": "Own\n---\n\ntext\n",
    "paragraph first": "Intro\n\n# Later\n",
    "h1 only": "# Only\n",
    "raw html h1": "<h1>raw</h1>\n\ntext\n",
    "h1 in a blockquote": "> # Quoted\n\ntext\n",
    "empty": "",
  };
  for (const [name, text] of Object.entries(cases)) {
    it(`${name}: leadHeading is non-null exactly when bodyStartsWithH1 is true, and the lead is an h1`, () => {
      const { r, ast } = renderWithAst(text);
      const starts = bodyStartsWithH1(ast);
      expect(r.leadHeading !== null, `bodyStartsWithH1 = ${starts}`).toBe(starts);
      if (starts) {
        expect(html(r.leadHeading)).toMatch(/^<h1[ >]/);
        expect(html(r.body)).not.toMatch(/^<h1[ >]/);
        expect(html(r.content)).toBe(html(r.leadHeading) + html(r.body));
      } else {
        expect(r.leadHeading).toBeNull();
      }
    });
  }

  it("the cases include at least one split page and one unsplit page (the table is not vacuous)", () => {
    const flags = Object.values(cases).map((t) => bodyStartsWithH1(renderWithAst(t).ast));
    expect(flags).toContain(true);
    expect(flags).toContain(false);
  });

  it("rendering a split page, and its parts as the page lays them out, logs no React key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const text of [cases["plain h1"]!, cases["setext h1"]!, "# Own\n\n- a\n- b\n\n## S\n\ntext\n"]) {
        const r = render(text);
        expect(r.leadHeading).not.toBeNull();
        html(r.content);
        html(r.leadHeading);
        html(r.body);
        // The page lays out [lead heading, meta line, body] as siblings.
        html([r.leadHeading, r.body]);
      }
      expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
