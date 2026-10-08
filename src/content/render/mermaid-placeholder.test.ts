import { emptyLinkMap } from "@/content/links/link-map.testing";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import messages from "../../../messages/en.json";
import { mermaidBlockId } from "./mermaid-placeholder";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { MERMAID_PLACEHOLDER_ATTRIBUTES, sanitizeSchema } from "./sanitize-schema";
import type { RenderedPage } from "./types";

const enc = new TextEncoder();
function snap(entries: Record<string, string>, sha = "abc"): WikiSnapshot {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "text/markdown" }]),
  );
  return { wikiId: "w", sha, files, pages: parsePages(files), linkMap: emptyLinkMap(), searchIndexJson: "", tree: [] };
}
function render(text: string, path = "p.md", sha = "abc"): { page: RenderedPage; html: string } {
  const r = renderPage(snap({ [path]: text }, sha), path);
  if ("state" in r) throw new Error("unavailable");
  return { page: r, html: renderToStaticMarkup(r.content) };
}
function attr(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => m[1]!);
}
const unescape = (s: string) =>
  s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

beforeEach(() => resetRenderCacheForTests());

describe("mermaid placeholder: US-086", () => {
  it("M1: a fence emits one inert placeholder carrying the raw source; mermaidBlocks lists it", () => {
    const { page, html } = render("Intro\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nOutro\n");
    expect(html.match(/data-mermaid-id=/g)).toHaveLength(1);
    expect(unescape(attr(html, "data-mermaid-source")[0]!)).toBe("graph TD\n  A-->B");
    expect(html).not.toContain("language-mermaid");
    expect(page.mermaidBlocks).toEqual([{ id: attr(html, "data-mermaid-id")[0], source: "graph TD\n  A-->B" }]);
  });
  it("M1: no `mermaid` import anywhere in src/content (evaluation-free)", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.(test|itest)\.ts$/.test(n)) files.push(p);
      }
    };
    walk(root);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+["']mermaid|import\(\s*["']mermaid|require\(\s*["']mermaid/);
  });
  it("W2-6: the placeholder carries the server-rendered caption before the source pre, from messages/en.json", () => {
    const { html } = render("```mermaid\ngraph TD\n  A-->B\n```\n");
    expect(html).toContain('<p data-mermaid-caption="">Diagram source (drawing needs JavaScript)</p><pre tabindex="0"><code>');
    expect(html.match(/data-mermaid-caption/g)).toHaveLength(1);
    expect(messages.mermaid).toEqual({
      caption: "Diagram source (drawing needs JavaScript)",
      drawError: "This diagram could not be drawn.",
      diagramName: "Diagram", // US-192: the generic accessible name of a drawn diagram with no author title
    });
  });
  it("W2-6: an author-written caption marker is stripped, so no look-alike caption survives", () => {
    const { html } = render('<p data-mermaid-caption="">fake</p>\n');
    expect(html).not.toContain("data-mermaid-caption");
  });
  it("M2 (TC-223): a syntactically invalid fence still emits a placeholder", () => {
    const { page, html } = render("```mermaid\nthis is ((( not mermaid\n```\n");
    expect(html).toContain("data-mermaid-id=");
    expect(page.mermaidBlocks).toHaveLength(1);
  });
  it("M3 (TC-224): quote, angle brackets, ampersand and apostrophe round-trip in attribute and text", () => {
    const source = `A["it's <b>&amp;</b>"] --> B{"x > y & z"}`;
    const { page, html } = render("```mermaid\n" + source + "\n```\n");
    expect(page.mermaidBlocks[0]!.source).toBe(source);
    expect(unescape(attr(html, "data-mermaid-source")[0]!)).toBe(source);
    // the attribute value has no raw breaking characters, and the text child holds the source escaped
    expect(attr(html, "data-mermaid-source")[0]).not.toMatch(/[<>"]/);
    expect(html).not.toContain("<b>");
    expect(unescape(/<code>([\s\S]*?)<\/code>/.exec(html)![1]!)).toBe(source);
  });
  it("M4 (TC-462 first half): ids unique within a page, deterministic, stable across renders", () => {
    const text = "```mermaid\na\n```\n\n```mermaid\nb\n```\n\n```mermaid\na\n```\n";
    const one = render(text, "docs/p.md").page.mermaidBlocks.map((b) => b.id);
    resetRenderCacheForTests();
    const two = render(text, "docs/p.md", "def").page.mermaidBlocks.map((b) => b.id);
    expect(new Set(one).size).toBe(3);
    expect(two).toEqual(one);
    expect(one[0]).toBe(mermaidBlockId("docs/p.md", 0));
    expect(mermaidBlockId("a.md", 0)).not.toBe(mermaidBlockId("b.md", 0));
  });
  it("M5 (TC-443 placeholder half): author-written data-mermaid-* never reaches the output", () => {
    const { page, html } = render('<div data-mermaid-id="x" data-mermaid-source="graph">hi</div>\n\ntext\n');
    expect(html).not.toMatch(/data-mermaid/);
    expect(html).toContain("hi");
    expect(page.mermaidBlocks).toEqual([]);
  });
  it("M5: an author forgery does not disturb the real placeholder's id", () => {
    const { page, html } = render('<span data-mermaid-id="mermaid-fake">x</span>\n\n```mermaid\nA-->B\n```\n');
    expect(attr(html, "data-mermaid-id")).toEqual([page.mermaidBlocks[0]!.id]);
    expect(html).not.toContain("mermaid-fake");
  });
  it("M5: upper-case, nested and pre/code-mimic author forgeries carry no data-mermaid-*", () => {
    const { page, html } = render(
      [
        '<div DATA-MERMAID-ID="x" DATA-MERMAID-SOURCE="s">upper</div>',
        "",
        '<section><div><p data-mermaid-id="n" data-mermaid-source="s">nested</p></div></section>',
        "",
        '<div data-mermaid-id="m" data-mermaid-source="s"><pre><code>mimic</code></pre></div>',
        "",
      ].join("\n"),
    );
    expect(html).not.toMatch(/data-mermaid/i);
    for (const t of ["upper", "nested", "mimic"]) expect(html).toContain(t);
    expect(page.mermaidBlocks).toEqual([]);
  });
  it("M5: the schema admits data-mermaid-* on div (id, source) and p (the caption, value \"\" only), as exact lists", () => {
    expect(MERMAID_PLACEHOLDER_ATTRIBUTES).toEqual(["dataMermaidId", "dataMermaidSource"]);
    for (const [tag, list] of Object.entries(sanitizeSchema.attributes ?? {})) {
      const names = list.map((e) => (Array.isArray(e) ? e[0] : e)).filter((n): n is string => typeof n === "string");
      expect(names.filter((n) => n.startsWith("dataMermaid")), tag).toEqual(
        tag === "div" ? ["dataMermaidId", "dataMermaidSource"] : tag === "p" ? ["dataMermaidCaption"] : [],
      );
      if (tag === "p") expect(list).toContainEqual(["dataMermaidCaption", ""]);
      expect(names.some((n) => n.includes("*") || n === "data*")).toBe(false);
    }
  });
  it("M6: a page with no fences has no placeholder and mermaidBlocks is []", () => {
    const { page, html } = render("# Hi\n\n```ts\nx\n```\n");
    expect(html).not.toContain("data-mermaid");
    expect(page.mermaidBlocks).toEqual([]);
  });
  it("does not mutate the shared AST", () => {
    const s = snap({ "p.md": "```mermaid\nA-->B\n```\n" });
    const before = JSON.stringify(s.pages.get("p.md")!.ast);
    renderPage(s, "p.md");
    expect(JSON.stringify(s.pages.get("p.md")!.ast)).toBe(before);
  });
});
