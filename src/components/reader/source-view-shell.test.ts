/** US-161 header and body wiring, rendered statically (no jsdom): the controls per mode, the copy strings, React-text-only body. */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { CopySourceButton } from "./copy-source-button";
import { PageShell, type PageShellProps } from "./page-shell";
import { SourceView } from "./source-view-body";

vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/" }));

const shell = (props: Partial<PageShellProps>, body = "body") =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: "a.md", children: body, ...props }),
    }),
  );
/** The page-actions row above the article (US-187: the controls moved out of the old plain header; US-188 gives them the page bar). */
const header = (html: string) => html.slice(html.indexOf('data-testid="reader-page-actions"'), html.indexOf('data-testid="reader-content"'));

describe("copy: the accepted strings, verbatim (R-14)", () => {
  it("messages/en.json source.* equals the accepted copy", () => {
    expect(messages.source).toEqual({
      viewSource: "View source",
      viewPage: "View page",
      copy: "Copy",
      copyLabel: "Copy Markdown source",
      copied: "Copied",
      download: "Download .md",
    });
  });
});

describe("PageShell source controls (D2)", () => {
  it("page view: a View source link, Save as PDF kept, no copy or download", () => {
    const h = header(shell({ sourceControls: { mode: "page", sourceHref: "/w/w1/a.md?view=source" } }));
    expect(h).toContain('href="/w/w1/a.md?view=source"');
    expect(h).toContain(">View source</a>");
    expect(h).toContain(">Save as PDF</button>");
    expect(h).not.toContain("Download .md");
    expect(h).not.toContain(">Copy<");
  });
  it("source view: View page, Copy, Download .md; no Save as PDF; every control hidden in print", () => {
    const h = header(
      shell({ sourceControls: { mode: "source", pageHref: "/w/w1/a.md", downloadHref: "/api/wikis/w1/source/abc/a.md", text: "x" } }),
    );
    expect(h).toContain('href="/w/w1/a.md"');
    expect(h).toContain(">View page</a>");
    expect(h).toContain('aria-label="Copy Markdown source"');
    expect(h).toContain(">Copy</button>");
    const download = h.match(/<a [^>]*data-testid="source-download"[^>]*>.*?<\/a>/)?.[0] ?? "";
    expect(download, "the Download control is one anchor").not.toBe("");
    expect(download).toContain('href="/api/wikis/w1/source/abc/a.md"');
    expect(download).toContain('download=""');
    expect(download).toMatch(/>(?:<svg[^>]*>.*?<\/svg>)?Download \.md<\/a>$/);
    expect(h).not.toContain("Save as PDF");
    expect(h).not.toContain("View source");
    for (const control of h.match(/<(a|span)\b[^>]*data-testid="(source-[^"]+)"[^>]*>/g) ?? []) {
      if (!control.includes("source-copy-status")) expect(control, control).toContain("print:hidden");
    }
  });
  it("the empty view has no page bar: no breadcrumbs, View source, Save as PDF or hint (US-188, FR-044 via CR-006)", () => {
    const out = shell({ activePath: null });
    for (const absent of ["reader-pagebar", "reader-page-actions", "breadcrumbs", "View source", "Save as PDF", "save-as-pdf", "pdf-browser-hint"]) {
      expect(out, absent).not.toContain(absent);
    }
  });
});

describe("PageShell page bar breadcrumbs (US-188, FR-052)", () => {
  const tree = [
    { kind: "folder" as const, name: "a", path: "a", children: [
      { kind: "page" as const, name: "_index", path: "a/_index.md", title: "A home" },
      { kind: "folder" as const, name: "b", path: "a/b", children: [{ kind: "page" as const, name: "p", path: "a/b/p.md", title: "P" }] },
    ] },
  ];
  it("page and source views both show folders then the title; only a folder with _index.md links", () => {
    for (const sourceControls of [{ mode: "page" as const, sourceHref: "/x" }, undefined]) {
      const out = shell({ tree, activePath: "a/b/p.md", pageTitle: "The page", sourceControls });
      const nav = /<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/.exec(out)![0];
      expect(nav.match(/<a\b/g)).toHaveLength(1);
      expect(nav).toContain('href="/w/w1/a/_index.md"');
      expect(nav).toMatch(/<span class="[^"]*">b<\/span>/);
      expect(nav).toMatch(/<span aria-current="page" title="The page"[^>]*>The page<\/span>/);
    }
  });
});

describe("CopySourceButton", () => {
  it("renders Copy with the accessible name and an empty polite status", () => {
    const html = renderToStaticMarkup(createElement(CopySourceButton, { text: "t", copy: { copy: "Copy", label: "Copy Markdown source", copied: "Copied" } }));
    expect(html).toContain('aria-label="Copy Markdown source"');
    expect(html).toContain(">Copy</button>");
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"[^>]*><\/span>/);
    expect(html).not.toContain("Copied");
    expect(html).not.toContain("<script");
  });
  it("US-194 row 1: the status region is in the success token colour, not the muted ink, and keeps its role and aria-live", () => {
    const html = renderToStaticMarkup(createElement(CopySourceButton, { text: "t", copy: { copy: "Copy", label: "Copy Markdown source", copied: "Copied" } }));
    const status = html.match(/<span\b[^>]*data-testid="source-copy-status"[^>]*>/)?.[0] ?? "";
    expect(status, "the status span renders").not.toBe("");
    expect(status).toContain('role="status"');
    expect(status).toContain('aria-live="polite"');
    expect(status.match(/class="([^"]*)"/)?.[1].split(/\s+/)).toContain("text-success");
    expect(status).not.toContain("text-muted-foreground");
  });
  it("never puts the source in the DOM (the prop is the clipboard's source)", () => {
    const html = renderToStaticMarkup(createElement(CopySourceButton, { text: "SECRET-SRC", copy: { copy: "Copy", label: "l", copied: "Copied" } }));
    expect(html).not.toContain("SECRET-SRC");
  });
});

describe("SourceView (TC-494)", () => {
  it("renders hostile source as escaped text only", () => {
    const text = '<script>window.__x=1</script><img src=x onerror="alert(1)"><style>a{}</style>[x](javascript:alert(1))\n```mermaid\ngraph TD\n```';
    const html = renderToStaticMarkup(createElement(SourceView, { text }));
    expect(html).not.toMatch(/<(script|img|style)\b/);
    expect(html).toContain("&lt;script&gt;window.__x=1&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("data-mermaid");
    expect(html).toMatch(/^<pre[^>]*><code>/);
  });

  it("turns off font ligatures so -- %% <!-- show as typed (US-161)", () => {
    const html = renderToStaticMarkup(createElement(SourceView, { text: "-- %% <!--" }));
    expect(html).toContain("[font-variant-ligatures:none]");
    expect(html).toContain("[font-feature-settings:&#x27;liga&#x27;_0,&#x27;calt&#x27;_0]");
  });
});
