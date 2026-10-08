import { buildLinkMap } from "@/content/links/link-map";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";

vi.mock("./pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline")>();
  return { ...actual, parseMarkdown: vi.fn(actual.parseMarkdown) };
});

import { parsePages } from "./parse";
import { parseMarkdown } from "./pipeline";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import type { RenderedPage } from "./types";

const enc = new TextEncoder();
function snapshotOf(entries: Record<string, string>): WikiSnapshot {
  const files = new Map<string, FileEntry>(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "text/markdown" }]),
  );
  const pages = parsePages(files);
  return { wikiId: "w", sha: "abc", files, pages, linkMap: buildLinkMap(pages, files, "w", "abc"), searchIndexJson: "", tree: [] };
}
function html(entries: Record<string, string>, path = "p.md"): string {
  const result = renderPage(snapshotOf(entries), path);
  if ("state" in result) throw new Error("unavailable");
  return renderToStaticMarkup(result.content);
}
function rendered(entries: Record<string, string>, path = "p.md"): RenderedPage {
  const result = renderPage(snapshotOf(entries), path);
  if ("state" in result) throw new Error("unavailable");
  return result;
}

beforeEach(() => {
  resetRenderCacheForTests();
  vi.mocked(parseMarkdown).mockClear();
});

const STRUCTURE = [
  "# Title One",
  "",
  "First paragraph.",
  "",
  "## Section Two",
  "",
  "Second paragraph.",
  "",
  "### Deep Three",
  "",
  "| Name | Value |",
  "|---|---|",
  "| a | 1 |",
  "| b | 2 |",
  "| c | 3 |",
  "",
  "![Diagram](img/diagram.png)",
].join("\n");

describe("renderPage: structure (S1)", () => {
  const out = html({ "p.md": STRUCTURE });
  it("renders headings at their levels with slug ids", () => {
    expect(out).toContain('<h1 id="user-content-title-one">Title One</h1>');
    expect(out).toContain('<h2 id="user-content-section-two">Section Two<a class="heading-anchor"');
    expect(out).toContain('<h3 id="user-content-deep-three">Deep Three<a class="heading-anchor"');
  });
  it("renders paragraphs", () => {
    expect(out).toContain("<p>First paragraph.</p>");
    expect(out).toContain("<p>Second paragraph.</p>");
  });
  it("renders a 2x3 table", () => {
    const thead = /<thead>(.*?)<\/thead>/s.exec(out)?.[1] ?? "";
    const tbody = /<tbody>(.*?)<\/tbody>/s.exec(out)?.[1] ?? "";
    expect(thead.match(/<th[ >]/g)).toHaveLength(2);
    expect(tbody.match(/<tr>/g)).toHaveLength(3);
    expect(tbody.match(/<td[ >]/g)).toHaveLength(6);
  });
  it("renders an image inside a paragraph (a relative image with no such file is the image marker, wave 7)", () => {
    expect(out).toContain('<p><span class="wikilink-unavailable">Image unavailable');
    expect(html({ "p.md": "![Diagram](img/diagram.png)", "img/diagram.png": "x" })).toContain('<p><img src="/api/wikis/w/asset/abc/img/diagram.png" alt="Diagram"/></p>');
  });
  it("renders a fence as plain pre/code", () => {
    expect(html({ "p.md": "```js\nx()\n```" })).toMatch(/<pre tabindex="0"><code[^>]*>x\(\)\n<\/code><\/pre>/);
  });
});

describe("renderPage: title and metadata (S2)", () => {
  it("returns the frontmatter title, its field, and no mermaid blocks", () => {
    const page = rendered({ "p.md": "---\ntitle: Project Brief\n---\n# H" });
    expect(page.title).toBe("Project Brief");
    expect(page.frontmatterView).toEqual([{ key: "title", value: "Project Brief" }]);
    expect(page.mermaidBlocks).toEqual([]);
    expect(page.path).toBe("p.md");
  });
  it("does not render the frontmatter block as text", () => {
    expect(html({ "p.md": "---\ntitle: Secret Title\n---\nbody" })).not.toContain("Secret Title");
  });
});

describe("renderPage: one parse (S4, BR-036)", () => {
  const PAGE = [
    "---",
    "title: Full",
    "---",
    "# H",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "> [!note]",
    "> Careful",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "See [[Other page]].",
  ].join("\n");

  it("parses N times in parsePages and 0 times in renderPage", () => {
    const snap = snapshotOf({ "p.md": PAGE, "q.md": "q" });
    expect(parseMarkdown).toHaveBeenCalledTimes(2);
    vi.mocked(parseMarkdown).mockClear();
    const result = renderPage(snap, "p.md");
    renderPage(snap, "q.md");
    expect(parseMarkdown).toHaveBeenCalledTimes(0);
    if ("state" in result) throw new Error("unavailable");
    expect(result.headings).toBe(snap.pages.get("p.md")!.headings);
  });
  it("renders the callout as a callout (US-073) and the unresolved wikilink as a non-link span (US-075)", () => {
    const out = html({ "p.md": PAGE });
    expect(out).toContain('<div class="callout callout-note" role="note">');
    expect(out).not.toContain("<blockquote>");
    expect(out).not.toContain("[!note]");
    expect(out).toContain('<span class="wikilink-unavailable" title="This link has no target in this wiki.">Other page<span class="wikilink-unavailable-indicator" aria-hidden="true"></span><span class="wikilink-unavailable-text">unavailable link</span></span>');
  });
});

describe("renderPage: robustness (S5)", () => {
  it("renders a ragged table without throwing", () => {
    expect(() => html({ "p.md": "| a | b |\n|---\n| 1 |\n| 1 | 2 | 3 |\n" })).not.toThrow();
  });
  it("returns unavailable for a missing path", () => {
    expect(renderPage(snapshotOf({ "p.md": "x" }), "nope.md")).toEqual({ state: "unavailable" });
  });
});

describe("renderPage: raw HTML sanitised (S6, W1-4, superseded by US-074)", () => {
  it("emits no script element or onerror attribute", () => {
    const out = html({ "p.md": "before\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nafter" });
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain("before");
    expect(out).toContain("after");
  });
  it("removes the handler from inline raw HTML too", () => {
    const out = html({ "p.md": "a <img src=x onerror=alert(1)> b" });
    expect(out).not.toMatch(/onerror/i);
  });
});

describe("renderPage: slug parity (S7, TR-019)", () => {
  it("emits the parse-time slugs as ids", () => {
    const snap = snapshotOf({ "p.md": "## Setup\n\na\n\n## Setup\n" });
    const result = renderPage(snap, "p.md");
    if ("state" in result) throw new Error("unavailable");
    const out = renderToStaticMarkup(result.content);
    expect(out).toContain('<h2 id="user-content-setup">');
    expect(out).toContain('<h2 id="user-content-setup-1">');
    expect(result.headings.map((h) => h.slug)).toEqual(["setup", "setup-1"]);
  });
  it("two renders from the same AST give identical markup (says nothing about caching)", () => {
    const snap = snapshotOf({ "p.md": "## Setup\n\n## Setup\n" });
    const a = renderPage(snap, "p.md");
    const b = renderPage(snap, "p.md");
    if ("state" in a || "state" in b) throw new Error("unavailable");
    expect(renderToStaticMarkup(a.content)).toBe(renderToStaticMarkup(b.content));
  });
  it("never mutates the shared parse AST (BR-036)", () => {
    const snap = snapshotOf({ "p.md": "---\ntitle: T\n---\n## Setup\n\n| a | b |\n|---|---|\n| 1 | 2 |\n" });
    const before = JSON.stringify(snap.pages.get("p.md")?.ast);
    renderPage(snap, "p.md");
    renderPage(snap, "p.md");
    expect(JSON.stringify(snap.pages.get("p.md")?.ast)).toBe(before);
  });
});

describe("renderPage: exact-key lookup (TC-438, US-099 wave 7 F-A)", () => {
  const snap = () => snapshotOf({ "docs/guide.md": "# Guide\n\nBody.\n" });

  it("renders docs/guide.md", () => {
    const result = renderPage(snap(), "docs/guide.md");
    expect("state" in result).toBe(false);
  });

  it.each(["Docs/guide.md", "docs/Guide.md", "docs/guide.MD", "docs/guide", "docs/guide.md/"])(
    "%s is unavailable: no case folding, no .md or trailing-slash fix-up",
    (path) => {
      expect(renderPage(snap(), path)).toEqual({ state: "unavailable" });
    },
  );
});
