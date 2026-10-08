import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import type { SearchRow } from "@/content/search/client";
import { PageShell } from "./page-shell";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CONTENT_CLASS } from "@/components/ui/dialog-classes";
import { SEARCH_DIALOG_CLASS, SearchDialogBody, SearchPanelView, type SearchCopy } from "./search-command-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => {
    throw new Error("the closed dialog must not mount the router");
  },
}));

const COPY: SearchCopy = {
  trigger: "Search",
  triggerLabel: "Search this wiki",
  dialogTitle: "Search this wiki",
  inputLabel: "Search this wiki",
  inputPlaceholder: "Search pages and headings",
  idle: "Type to search this wiki.",
  loading: "Loading search\u2026",
  failed: "Search is unavailable. Reload the page to try again, or browse the pages in the sidebar.",
  empty: "No pages match \u201c{query}\u201d",
  emptyText: "Search looks at page titles, headings and text. Try fewer or different words, or browse the pages in the sidebar.",
  shortcutApple: "\u2318K",
  shortcutOther: "Ctrl K",
  listLabel: "Search results",
  resultCountOne: "1 result",
  resultCountOther: "{count} results",
  close: "Close search",
};

const row = (over: Partial<SearchRow> = {}): SearchRow => ({ id: "a.md#0", path: "a.md", slug: "", title: "Alpha", heading: "", score: 1, terms: [], ...over });
const view = (props: Partial<Parameters<typeof SearchPanelView>[0]> = {}) =>
  renderToStaticMarkup(createElement(SearchPanelView, { wikiId: "w1", copy: COPY, phase: "ready", query: "", rows: [], ...props }));

describe("copy: the accepted strings, verbatim (R-12)", () => {
  it("messages/en.json search.* equals the accepted copy", () => {
    expect(messages.search).toEqual({
      trigger: "Search",
      triggerLabel: "Search this wiki",
      dialogTitle: "Search this wiki",
      inputLabel: "Search this wiki",
      inputPlaceholder: "Search pages and headings",
      idle: "Type to search this wiki.",
      loading: "Loading search\u2026",
      failed: "Search is unavailable. Reload the page to try again, or browse the pages in the sidebar.",
      empty: "No pages match \u201c{query}\u201d",
      emptyText: "Search looks at page titles, headings and text. Try fewer or different words, or browse the pages in the sidebar.",
      shortcutApple: "\u2318K",
      shortcutOther: "Ctrl K",
      listLabel: "Search results",
      resultCountOne: "1 result",
      resultCountOther: "{count} results",
      close: "Close search",
    });
  });
});

describe("states (D3, D4; TC-228, TC-476)", () => {
  it("idle: empty and whitespace queries show the idle copy and not the no-match copy", () => {
    for (const query of ["", "   "]) {
      const out = view({ query });
      expect(out).toContain("Type to search this wiki.");
      expect(out).not.toContain("No pages match");
    }
  });
  it("loading shows the loading copy", () => {
    expect(view({ phase: "loading" })).toContain("Loading search\u2026");
  });
  it("failed shows the failure copy as an alert, with no result list", () => {
    const out = view({ phase: "failed", query: "x" });
    expect(out).toContain("Search is unavailable. Reload the page to try again, or browse the pages in the sidebar.");
    expect(out).toContain('role="alert"');
    // The list stays mounted but hidden and empty (BUG-037), so the input's aria-controls resolves.
    expect(/<div[^>]*role="listbox"[^>]*>/.exec(out)![0]).toMatch(/\shidden(=""|\s|>)/);
    expect(out).not.toContain('role="option"');
  });
  it("no matches shows the ruled title with the query as text, and the ruled hint (US-222)", () => {
    const out = view({ query: "zzzz" });
    expect(out).toMatch(/<p[^>]*data-slot="empty-state-title"[^>]*>No pages match \u201czzzz\u201d<\/p>/);
    expect(out).toMatch(/<p[^>]*data-slot="empty-state-text"[^>]*>Search looks at page titles, headings and text\. Try fewer or different words, or browse the pages in the sidebar\.<\/p>/);
  });
  it("the query in the empty title is trimmed, capped at 200 characters and escaped text; '$&' is not a replacement pattern", () => {
    expect(view({ query: "  <b>x</b> $& ", phase: "ready" })).toContain("No pages match \u201c&lt;b&gt;x&lt;/b&gt; $&amp;\u201d");
    const long = /data-slot="empty-state-title"[^>]*>([^<]*)</.exec(view({ query: "q".repeat(500) }))![1];
    expect(long).toBe(`No pages match \u201c${"q".repeat(200)}\u201d`);
  });
  it("the input is labelled and carries the placeholder", () => {
    const out = view();
    expect(out).toContain("Search pages and headings");
    expect(out).toMatch(/<label[^>]*for="[^"]+"[^>]*>Search this wiki<\/label>/);
  });
});

describe("results (US-092, D5, D6; TC-474, TC-478)", () => {
  it("each row is a real link; a heading row shows its heading under the title; the count is a polite live region", () => {
    const out = view({
      query: "a",
      rows: [row(), row({ id: "a.md#1", slug: "setup", heading: "Setup" })],
    });
    expect(out).toContain('href="/w/w1/a.md"');
    expect(out).toContain('href="/w/w1/a.md#user-content-setup"');
    expect(out).toMatch(/Alpha<\/span><span[^>]*>Setup<\/span>/);
    expect(out).toMatch(/aria-live="polite"[^>]*>2 results</);
    expect(out).toContain('role="listbox"');
  });
  it("the listbox's accessible name is 'Search results' and cmdk's 'Suggestions' appears nowhere", () => {
    const out = view({ query: "a", rows: [row()] });
    expect(out).toMatch(/role="listbox"[^>]*aria-label="Search results"/);
    expect(out).not.toContain("Suggestions");
  });
  it("one result reads '1 result'", () => {
    expect(view({ query: "a", rows: [row()] })).toMatch(/>1 result</);
  });
  it("hostile titles and headings are escaped text, never markup", () => {
    const evil = `<img src=x onerror="window.__x=1">`;
    const out = view({ query: "a", rows: [row({ title: evil, heading: evil, slug: "s" })] });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=&quot;window.__x=1&quot;&gt;");
    expect(out).not.toMatch(/href="(?:javascript|https?):/);
  });
  it("the sources use no dangerouslySetInnerHTML", () => {
    const src = readFileSync(fileURLToPath(new URL("./search-command-dialog.tsx", import.meta.url)), "utf8");
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).toMatch(/shouldFilter=\{false\}/);
  });
});

describe("restyle (US-193; NFR-013)", () => {
  it("the count is visible (not sr-only) and stays a polite status region with its hook", () => {
    const out = view({ query: "a", rows: [row()] });
    const count = /<p[^>]*data-testid="search-count"[^>]*>/.exec(out)![0];
    expect(count).toContain('role="status"');
    expect(count).toContain('aria-live="polite"');
    expect(count).not.toContain("sr-only");
  });
  it("the field holds a decorative magnifier before the input", () => {
    const out = view();
    expect(out).toMatch(/<svg[^>]*lucide-search[^>]*aria-hidden="true"[^>]*>.*<input/);
  });
  it("a page row shows the file icon, a heading row the hash icon, both hidden from assistive technology", () => {
    const out = view({ query: "a", rows: [row(), row({ id: "a.md#1", slug: "setup", heading: "Setup" })] });
    const [first, second] = out.split('data-testid="search-result"').slice(1);
    expect(first).toMatch(/lucide-file-text[^>]*aria-hidden="true"|aria-hidden="true"[^>]*lucide-file-text/);
    expect(second).toMatch(/lucide-hash[^>]*aria-hidden="true"|aria-hidden="true"[^>]*lucide-hash/);
    expect(first).not.toContain("search-result-heading");
  });
  it("the highlighted row takes the selected surface and a bold link-colour title; the list scrolls inside the dialog", () => {
    const out = view({ query: "a", rows: [row()] });
    expect(out).toContain("data-[selected=true]:bg-surface-selected");
    expect(out).toContain("group-data-[selected=true]:text-primary-text");
    expect(out).toContain("group-data-[selected=true]:font-bold");
    expect(/<div[^>]*role="listbox"[^>]*>/.exec(out)![0]).toContain("overflow-y-auto");
  });
  it("failed is the danger Alert (role alert, hook kept); empty is the compact EmptyState with the search icon; idle and loading are status", () => {
    const failed = view({ phase: "failed" });
    expect(failed).toMatch(/<div[^>]*role="alert"[^>]*data-variant="danger"[^>]*data-testid="search-failed"|<div[^>]*data-testid="search-failed"[^>]*role="alert"/);
    const empty = view({ query: "zzz" });
    expect(empty).toContain('data-testid="search-empty"');
    expect(empty).toContain('data-slot="empty-state"');
    expect(empty).toContain("lucide-search");
    for (const [phase, query, hook] of [["loading", "", "search-loading"], ["ready", "", "search-idle"]] as const) {
      expect(view({ phase, query })).toMatch(new RegExp(`<p[^>]*role="status"[^>]*data-testid="${hook}"`));
    }
  });
  it("BUG-037: in every non-results state the input's aria-controls names an element present in the markup, and the hidden list holds no rows or hook", () => {
    for (const out of [view(), view({ phase: "loading" }), view({ query: "zzz" }), view({ phase: "failed" })]) {
      const id = /<input[^>]*aria-controls="([^"]+)"/.exec(out)?.[1];
      expect(id).toBeTruthy();
      expect(out).toContain(`id="${id}"`);
      const list = /<div[^>]*role="listbox"[^>]*>/.exec(out)![0];
      expect(list).toMatch(/\shidden(=""|\s|>)/);
      expect(list).not.toContain("search-results");
      expect(out).not.toContain('data-testid="search-result"');
    }
  });
  it("placement: near the top at 10vh with a height cap of 80vh, and on a phone 0.5rem from the top and never taller than the viewport", () => {
    const merged = cn(CONTENT_CLASS, SEARCH_DIALOG_CLASS);
    expect(merged).toContain("top-[10vh]");
    expect(merged).not.toContain("top-1/2");
    expect(merged).not.toContain("-translate-y-1/2");
    expect(merged).toContain("max-h-[80vh]");
    expect(merged).not.toContain("max-h-none");
    expect(merged).toContain("max-[599.98px]:top-2");
    expect(merged).toContain("max-[599.98px]:max-h-[calc(100vh-1rem)]");
  });
});

describe("matched words and the folder path (US-222; TC-517, TC-518)", () => {
  it("title and heading words in terms are marks with the wr-search__match class; the unmatched words are plain text", () => {
    const out = view({ query: "markdown pipeline", rows: [row({ title: "Server-side Markdown pipeline", heading: "The pipeline", slug: "s", terms: ["markdown", "pipeline"] })] });
    expect(out).toContain('Server-side <mark class="wr-search__match">Markdown</mark> <mark class="wr-search__match">pipeline</mark>');
    expect(out).toContain('The <mark class="wr-search__match">pipeline</mark>');
    expect(out).not.toMatch(/<mark[^>]*>[^<]*<mark/);
  });
  it("a row with no terms, or only a body match, has no mark", () => {
    expect(view({ query: "a", rows: [row()] })).not.toContain("<mark");
  });
  it("hostile text stays text even when it is matched: no element is made from the title, and no mark nests", () => {
    const out = view({ query: "x", rows: [row({ title: "<img src=x onerror=1> a", terms: ["a", "<img", "src=x"] })] });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(out).not.toMatch(/<mark[^>]*>[^<]*<mark/);
  });
  it("a nested page shows its folders joined by an aria-hidden separator, with the file name nowhere in the path line", () => {
    const out = view({ query: "m", rows: [row({ path: "deliverables/architecture/ADR-008 Server.md", title: "ADR-008 Server" })] });
    const path = /<span[^>]*data-testid="search-result-path"[^>]*>.*?<\/span><\/span>/.exec(out)![0];
    expect(path).toContain("deliverables");
    expect(path).toContain('<span aria-hidden="true" class="flex-none px-1">\u203a</span>');
    expect(path).toContain("architecture");
    expect(path).not.toContain("ADR-008");
    expect(path.replace(/<[^>]+>/g, "")).toBe("deliverables \u203a architecture");
  });
  it("a page at the wiki root has no path line and no stray separator", () => {
    const out = view({ query: "a", rows: [row({ path: "Readme.md" })] });
    expect(out).not.toContain("search-result-path");
    expect(out).not.toContain("\u203a");
  });
  it("a folder name holding the separator is one name, as escaped text, and a long name truncates instead of wrapping", () => {
    const out = view({ query: "a", rows: [row({ path: "A \u203a B/<i onclick=x>/x.md" })] });
    expect(out).toContain("A \u203a B");
    expect(out).not.toContain("<i ");
    expect(out).toContain("&lt;i onclick=x&gt;");
    const path = /<span[^>]*data-testid="search-result-path"[^>]*>/.exec(out)![0];
    expect(path).toContain("whitespace-nowrap");
    expect(path).toContain("overflow-hidden");
    expect(out).toContain("truncate");
  });
  it("the shortcut listener asks the DOM for an open menu or select before opening", () => {
    const src = readFileSync(fileURLToPath(new URL("./search-command-dialog.tsx", import.meta.url)), "utf8");
    expect(src).toMatch(/document\.querySelector\(OPEN_POPUP_SELECTOR\)/);
    expect(src).toMatch(/shouldOpenOnShortcut\(event, \{ \.\.\.gate\.current, popupOpen \}\)/);
  });
  it("the sources build marks as React elements: no dangerouslySetInnerHTML, no RegExp made from a term", () => {
    for (const file of ["./search-command-dialog.tsx", "./search-highlight.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(src).not.toContain("dangerouslySetInnerHTML");
      expect(src).not.toMatch(/new RegExp\(/);
    }
  });
});

describe("the input (US-222)", () => {
  it("is 48px: the kit's small control height, not the 56px large one", () => {
    const input = /<input[^>]*>/.exec(view())![0];
    expect(input).toContain("h-(--control-h-s)");
    expect(input).not.toContain("h-(--control-h-l)");
  });
});

describe("the trigger in the reader header (D1, S7-R1)", () => {
  const html = (el: ReactElement) =>
    renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: el }));
  it("renders a Search button with the accessible name in the topbar, icon-only below md and 280px from md, and no dialog yet (US-187)", () => {
    const out = html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: null }));
    expect(out).toMatch(/<header[^>]*data-testid="app-header"[^>]*>.*<button[^>]*aria-label="Search this wiki"[^>]*>.*<span class="[^"]*max-md:sr-only[^"]*">Search<\/span><\/button>.*<\/header>/);
    const trigger = /<button[^>]*data-testid="search-trigger"[^>]*>/.exec(out)![0];
    expect(trigger).toContain("md:w-70");
    expect(trigger).toContain("max-md:w-(--control-h-m)");
    expect(out).not.toContain('role="dialog"');
    expect(out).toContain("print:hidden");
  });
  it("carries aria-keyshortcuts and no hint in the server HTML, which is platform-neutral (US-222)", () => {
    const out = html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: null }));
    expect(/<button[^>]*data-testid="search-trigger"[^>]*>/.exec(out)![0]).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(out).not.toContain("search-shortcut-hint");
    expect(out).not.toContain("Ctrl K");
    expect(out).not.toContain("\u2318K");
  });
  it("the hint is an aria-hidden kbd in the sans family (so the ligature guard does not apply), hidden where the trigger is icon-only and in print", () => {
    const src = readFileSync(fileURLToPath(new URL("./search-command-dialog.tsx", import.meta.url)), "utf8");
    const kbd = /<kbd[\s\S]*?>/.exec(src)![0];
    expect(kbd).toContain('aria-hidden="true"');
    expect(kbd).toContain("font-sans");
    expect(kbd).not.toContain("font-mono");
    expect(kbd).toContain("max-md:hidden");
    expect(kbd).toContain("print:hidden");
  });
});

describe("focus order (D7)", () => {
  it("the input precedes the close control, so Radix focuses the input on open; the close keeps its name", () => {
    const out = renderToStaticMarkup(
      createElement(Dialog, { open: true }, createElement(SearchDialogBody, { copy: COPY, children: createElement(SearchPanelView, { wikiId: "w", copy: COPY, phase: "ready", query: "", rows: [] }) })),
    );
    expect(out.indexOf("<input")).toBeGreaterThan(-1);
    expect(out.indexOf("<input")).toBeLessThan(out.indexOf('data-testid="search-close"'));
    expect(out).toContain('aria-label="Close search"');
  });
});
