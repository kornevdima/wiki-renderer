/**
 * Component specs for `./unavailable-view`, `./page-shell` and the segment `not-found.tsx` (US-099 + US-100 +
 * US-158 contract S11, S12; X6, X9). `renderToStaticMarkup` with the REAL `messages/en.json`, so the accepted
 * copy (R-12) is checked verbatim.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import type { NavNode } from "../../content/runtime/types";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => {
    // Only namespaces whose values are all strings are looked up; a nested namespace (e.g. `callouts`) is skipped.
    const section: unknown = (messages as Record<string, unknown>)[namespace];
    const value = typeof section === "object" && section !== null ? (section as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" ? value : `${namespace}.${key}`;
  }),
}));

import WikiNotFound, { generateMetadata } from "../../app/w/[wikiId]/not-found";
import { SkipLink } from "../layout/skip-link";
import { PageShell } from "./page-shell";
import { UnavailableView } from "./unavailable-view";

function html(element: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: element }));
}

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("S11 (X6, US-100): UnavailableView takes only a kind, and the uniform view is byte-identical", () => {
  it("the accepted copy, verbatim (R-12)", () => {
    const out = html(createElement(UnavailableView, { kind: "no-access" }));
    expect(out).toMatch(/<h1 [^>]*>This page is unavailable<\/h1>/);
    expect(out).toMatch(/<p [^>]*>It doesn&#x27;t exist, or you don&#x27;t have access to it.<\/p>/);
    expect(out).toMatch(/<a [^>]*href="\/"[^>]*>Back to your wikis<\/a>/);
    expect(out).toContain('data-testid="unavailable-back"');
  });

  it("the empty kind carries the empty-wiki copy and no link", () => {
    const out = html(createElement(UnavailableView, { kind: "empty" }));
    expect(out).toContain("This wiki has no pages yet");
    expect(out).toContain("Pages appear here as soon as they are added to the wiki.");
    expect(out).not.toContain("<a ");
  });

  it("takes exactly one argument, whose type is only a kind and, for no-cache, the retry href (no reason, id, path or name prop)", () => {
    expect(UnavailableView.length).toBe(1);
    const source = read("./unavailable-view.tsx");
    expect(source).toContain("export function UnavailableView(props: UnavailableViewProps)");
    expect(source.replace(/\s+/g, " ")).toContain(
      'export type UnavailableViewProps = | { kind: "no-access" | "empty" } | { kind: "no-cache"; retryHref: string };',
    );
  });

  it("US-195: the no-access view is the bare frame around one main (no data-kind, no title of its own), and its text is the accepted copy only", () => {
    const out = html(createElement(UnavailableView, { kind: "no-access" }));
    expect(out.startsWith('<div data-slot="bare-frame"')).toBe(true);
    expect(out).toContain('<main id="main" tabindex="-1" data-testid="unavailable-view" class=');
    expect(out).not.toMatch(/<main\b[^>]*data-kind/); // the brand's TenantLogo carries its own data-kind
    expect(out).not.toContain("<title>");
    expect(out.match(/<main\b/g)).toHaveLength(1);
    const text = out.replace(/<[^>]*>/g, "|").split("|").filter(Boolean);
    expect(text).toEqual(["WR", "Wiki Renderer", "Wikis", "This page is unavailable", "It doesn&#x27;t exist, or you don&#x27;t have access to it.", "Back to your wikis"]);
  });

  it("not-found.tsx receives no params and draws kind=no-access", () => {
    expect(WikiNotFound.length).toBe(0);
    const source = read("../../app/w/[wikiId]/not-found.tsx");
    expect(source).toContain("export default function WikiNotFound() {");
    expect(source).toContain('<UnavailableView kind="no-access" />');
    expect(source).toContain("export async function generateMetadata()");
  });

  it("rendered twice (two causes), the HTML is byte-identical and names no wiki id, path or wiki", () => {
    const first = html(createElement(WikiNotFound));
    const second = html(createElement(WikiNotFound));
    expect(second).toBe(first);
    expect(first).not.toMatch(/6abc|wiki-id|wikiId|\.md/i);
  });

  it("F-B: the 404 <title> has two halves, and neither may go: the head metadata (raw HTML) and the body <title> (survives hydration)", async () => {
    expect(await generateMetadata()).toEqual({ title: "This page is unavailable · Wiki Renderer" });
    const out = html(createElement(WikiNotFound));
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.startsWith('<title>This page is unavailable · Wiki Renderer</title><div data-slot="bare-frame"')).toBe(true);
    expect(out.endsWith(html(createElement(UnavailableView, { kind: "no-access" })))).toBe(true);
  });
});

describe("S12 (X9, US-158 sc.6-7): the shell's only way out of the wiki is All wikis to /", () => {
  const WIKI = "6abc14b04a924c5ba918f4ff";

  function anchors(out: string): string[] {
    return [...out.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]!);
  }

  it("every a[href] that does not start with /w/{wikiId}/ is /: the brand and All wikis (US-187)", () => {
    const out = html(createElement(PageShell, { wikiId: WIKI, wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: createElement("p", null, "body") }));
    const outLinks = anchors(out).filter((href) => !href.startsWith(`/w/${WIKI}/`));
    expect(outLinks).toEqual(["/", "/"]);
    expect(out.match(/data-testid="reader-all-wikis"/g)).toHaveLength(1);
    expect(out).toContain('data-testid="reader-all-wikis"');
    expect(out).toContain(">All wikis</a>");
  });

  it("with a non-empty tree (nested page, root page, a name with a space and #), every nav href is under /w/{wikiId}/, / is the only other link, and no href has a raw # or ?", () => {
    const tree: NavNode[] = [
      {
        kind: "folder",
        name: "my docs #1",
        path: "my docs #1",
        children: [{ kind: "page", name: "a?b&c", path: "my docs #1/a?b&c.md", title: "Nested" }],
      },
      { kind: "page", name: "README", path: "README.md", title: "Root" },
    ];
    const out = html(
      createElement(PageShell, { wikiId: WIKI, wiki: { name: "Guide" }, sha: "a".repeat(40), tree, activePath: "README.md", children: createElement("p", null, "body") }),
    );
    const hrefs = anchors(out);
    expect(hrefs.filter((href) => href.startsWith(`/w/${WIKI}/`))).toHaveLength(2);
    expect(hrefs.filter((href) => !href.startsWith(`/w/${WIKI}/`))).toEqual(["/", "/"]);
    for (const href of hrefs) expect(href).not.toMatch(/[#?]/);
  });

  it("carries no wiki switcher control and no form; its four buttons are the menu button, the drawer's Close navigation (in the empty view's shell), the Search trigger (US-091) and the Theme select trigger, and its one native select is the English-only Language select (US-098)", () => {
    const out = html(createElement(PageShell, { wikiId: WIKI, wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: null }));
    expect(out).not.toMatch(/<(form|input)\b/);
    // Four buttons: the menu button (US-187, below bp-lg), the drawer's Close navigation (US-222), the Search trigger (US-091) and the Theme select's trigger (US-172). The empty view has no page bar, so no Save as PDF (US-188, FR-044 via CR-006).
    expect(out.match(/<button\b/g) ?? []).toHaveLength(4);
    expect(out).toContain('data-testid="nav-close"');
    expect(out).toContain('data-testid="search-trigger"');
    expect(out).toContain('data-testid="theme-select"');
    expect(out).not.toContain("Save as PDF");
    // The Language select by id; the Theme select (US-172) is a Radix select with its own hidden native select.
    expect(out.match(/<select id="locale-switcher-select"/g) ?? []).toHaveLength(1);
    expect(out).toContain('<option value="en" selected="">English</option>');
  });

  it("puts the page body in the wr-prose content column", () => {
    const out = html(createElement(PageShell, { wikiId: WIKI, wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: createElement("p", null, "body") }));
    expect(out).toMatch(/<main[^>]*data-testid="reader-content"[^>]*class="wr-prose[^"]*"/);
  });

  it("the shell and sidebar sources declare no href other than the All wikis link", () => {
    expect((read("./page-shell.tsx").match(/href=/g) ?? []).length).toBe(0);
    expect((read("./reader-sidebar.tsx").match(/href=/g) ?? []).length).toBe(1);
    expect(read("./reader-sidebar.tsx")).toContain('href="/"');
  });
});

describe("S5 + S9 (TC-426, TC-439): the retry screen carries only the accepted copy", () => {
  it("no-cache: accepted copy verbatim, one <title>, the retry link and the back link, nothing else", () => {
    const out = html(createElement(UnavailableView, { kind: "no-cache", retryHref: "/w/abc/x.md" }));
    expect(out).toContain("<title>Temporarily unavailable · Wiki Renderer</title>");
    expect(out).toMatch(/<h1 [^>]*>Temporarily unavailable<\/h1>/);
    expect(out).toMatch(/<p [^>]*>We can&#x27;t reach this wiki&#x27;s source right now. Try again in a moment.<\/p>/);
    expect(out).toMatch(/<a href="\/w\/abc\/x.md" data-testid="unavailable-retry"[^>]*>(<svg[^>]*>.*?<\/svg>)?Try again<\/a>/);
    expect(out).toContain('data-testid="unavailable-back"');
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect([...out.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1])).toEqual(["/", "/w/abc/x.md", "/"]); // the brand lockup, Try again, Back to your wikis
    expect(out).not.toMatch(/reader-shell|stale-notice|github|token|error/i);
  });

  it("the retry link is a plain anchor: no onClick, no client component, no 'use client'", () => {
    const source = read("./unavailable-view.tsx");
    expect(source).not.toMatch(/onClick|"use client"|'use client'/);
    expect(source).toContain("<a href={props.retryHref}");
  });
});

describe("S2 + S3 + S4 (US-101): the stale notice", () => {
  const since = (iso: string) => createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, stale: { since: new Date(iso) }, children: null });

  it("S2: renders exactly the accepted sentence, HH:MM UTC, 24-hour, zero-padded", () => {
    expect(html(since("2026-09-29T14:32:59Z"))).toMatch(
      /<div role="status" data-slot="alert" data-variant="warning"[^>]*print:hidden"[^>]*data-testid="stale-notice">.*<div data-slot="alert-text">Content may be out of date, last updated 14:32 UTC\.<\/div>/,
    );
    expect(html(since("2026-09-29T03:05:00Z"))).toContain("last updated 03:05 UTC.");
    expect(html(since("2026-09-29T00:00:59Z"))).toContain("last updated 00:00 UTC.");
    expect(html(since("2026-09-29T23:59:00Z"))).toContain("last updated 23:59 UTC.");
  });

  it("S2: the same output whatever process.env.TZ is", () => {
    const original = process.env.TZ;
    try {
      const outputs = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"].map((tz) => {
        process.env.TZ = tz;
        return html(since("2026-09-29T14:32:59Z"));
      });
      expect(new Set(outputs).size).toBe(1);
      expect(outputs[0]).toContain("last updated 14:32 UTC.");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("S3: the notice text is exactly the accepted sentence: no GitHub, source or cause word", () => {
    const text = html(since("2026-09-29T14:32:59Z")).match(/data-testid="stale-notice".*?<div data-slot="alert-text">([^<]*)</)![1];
    expect(text).toBe("Content may be out of date, last updated 14:32 UTC.");
    expect(text).not.toMatch(/github|source|size|limit|network|error|fail/i);
  });

  it("S4 (T13): the shell's stale prop type is { since: Date } and nothing else; StaleNotice takes only since", () => {
    expect(read("./page-shell.tsx").replace(/\s+/g, " ")).toContain("stale?: { since: Date };");
    expect(read("./stale-notice.tsx")).toContain("export function StaleNotice({ since }: { since: Date })");
  });

  it("no stale prop -> no notice, and the shell is the kit's AppShell around one main (US-187)", () => {
    const out = html(createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: createElement("p", null, "x") }));
    expect(out).not.toContain("stale-notice");
    expect(out).toMatch(/^<div data-wiki-id="w1" data-testid="reader-shell"/);
    expect(out.match(/<main\b/g)).toHaveLength(1);
    expect(out).toContain('<main id="main" tabindex="-1" data-testid="reader-content" class="wr-prose min-w-0"><p>x</p></main>');
    expect(out).toContain('data-testid="reader-sidebar"');
    expect(out).toContain('data-testid="app-header"');
  });

  it("the notice sits between the header and the content column", () => {
    const out = html(since("2026-09-29T14:32:59Z"));
    expect(out.indexOf("</header>")).toBeLessThan(out.indexOf("stale-notice"));
    expect(out.indexOf("stale-notice")).toBeLessThan(out.indexOf("reader-content"));
  });
});

describe("US-195: the five views' look", () => {
  const retry = html(createElement(UnavailableView, { kind: "no-cache", retryHref: "/w/abc" }));
  const noAccess = html(createElement(UnavailableView, { kind: "no-access" }));
  const empty = html(createElement(UnavailableView, { kind: "empty" }));

  const variantOf = (out: string, testId: string) => out.match(new RegExp(`data-testid="${testId}"[^>]*data-variant="([a-z]+)"|data-variant="([a-z]+)"[^>]*data-testid="${testId}"`))?.slice(1).find(Boolean);
  const icon = (out: string) => out.match(/data-slot="empty-state-icon".*?class="lucide lucide-([a-z-]+)"/)![1];

  it("the two bare views are full EmptyStates with an h1, capped at --modal-w, in the bare frame", () => {
    for (const out of [retry, noAccess]) {
      expect(out).toContain('data-slot="bare-frame"');
      expect(out).toContain('data-size="full"');
      expect(out).toContain("max-w-(--modal-w)");
      expect(out).toMatch(/<h1 data-slot="empty-state-title"/);
      expect(out.match(/<main\b/g)).toHaveLength(1);
      expect(out.match(/<h1\b/g)).toHaveLength(1);
    }
  });

  it("the frame's bar is --topbar-h tall with a hairline bottom border, holds the brand lockup only (no All wikis), and does not print", () => {
    for (const out of [retry, noAccess]) {
      const bar = out.match(/<header data-slot="bare-frame-bar".*?<\/header>/)![0];
      expect(bar).toContain("h-(--topbar-h)");
      expect(bar).toMatch(/\bborder-b\b/);
      expect(bar).toContain("print:hidden");
      expect(bar).toContain('data-testid="brand"');
      expect(bar).toContain('data-slot="tenant-logo"');
      expect(bar).toContain(">WR<");
      expect(bar).toContain(">Wiki Renderer<");
      expect(bar).toContain(">Wikis<");
      expect(bar).not.toContain("All wikis");
      expect(bar.match(/<a\b/g)).toHaveLength(1);
    }
  });

  it("the icon per kind: cloud-off (retry), file-x (no-access), file (empty); each inside the aria-hidden icon slot", () => {
    expect(icon(retry)).toBe("cloud-off");
    expect(icon(noAccess)).toBe("file-x");
    expect(noAccess).not.toContain("lucide-search");
    expect(icon(empty)).toBe("file");
    for (const out of [retry, noAccess, empty]) expect(out).toMatch(/data-slot="empty-state-icon" aria-hidden="true"/);
  });

  it("the button variants per kind: retry solid Try again + outline Back; no-access one solid Back", () => {
    expect(variantOf(retry, "unavailable-retry")).toBe("solid");
    expect(variantOf(retry, "unavailable-back")).toBe("outline");
    expect(variantOf(noAccess, "unavailable-back")).toBe("solid");
    expect(retry.match(/data-slot="button"/g)).toHaveLength(2);
    expect(noAccess.match(/data-slot="button"/g)).toHaveLength(1);
  });

  it("US-221: every title keeps the kit's default `title` 20/24 (no size override), and each screen is a flush Panel around the EmptyState", () => {
    for (const out of [retry, noAccess, empty]) {
      const h1 = out.match(/<h1 data-slot="empty-state-title"[^>]*>/)![0];
      expect(h1).toContain("text-xl");
      expect(h1).toContain("leading-6");
      expect(h1).not.toContain("text-[28px]");
      expect(out).toMatch(/<section data-slot="panel"[^>]*overflow-hidden[^>]*><div [^>]*><div data-slot="empty-state"/);
    }
    expect(read("./unavailable-view.tsx")).not.toMatch(/titleClassName|text-\[28px\]/);
    for (const out of [retry, noAccess]) expect(out).not.toContain(".wr-prose");
  });

  it("the empty kind is a full EmptyState inside the shell's content (no frame, no main, no button, no title of its own), keeping its hook and heading", () => {
    expect(empty).toMatch(/data-testid="wiki-empty-view"/);
    expect(empty).toContain('data-size="full"');
    expect(empty).toMatch(/<h1 data-slot="empty-state-title"[^>]*>This wiki has no pages yet<\/h1>/);
    expect(empty).not.toMatch(/bare-frame|<main|<a |data-slot="button"/);
    expect(empty).not.toContain("<title>");
    expect(empty).not.toMatch(/breadcrumb/i);
  });

  it("the bare views name no wiki, repository or page: their only inputs are the kind and the retry href, and the text is fixed", () => {
    for (const out of [retry, noAccess]) {
      const visible = out.replace(/<title>.*?<\/title>/, "").replace(/<[^>]*>/g, "|").split("|").filter(Boolean);
      expect(visible.slice(0, 3)).toEqual(["WR", "Wiki Renderer", "Wikis"]);
      expect(visible).toHaveLength(visible.length); // text nodes only: no attribute carries a name
    }
    expect(retry).not.toMatch(/guide|repo|\.md/i);
    const source = read("./unavailable-view.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/wikiId|wiki\.name|\.name\b|repo/);
  });

  it("the stale notice is a warning Alert (role status) with print:hidden and no cause word", () => {
    const out = html(createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, stale: { since: new Date("2026-09-29T14:32:59Z") }, children: null }));
    expect(out).toMatch(/<div role="status" data-slot="alert" data-variant="warning"[^>]*data-testid="stale-notice"/);
    expect(out).toMatch(/data-variant="warning"[^>]*print:hidden/);
  });
});

describe("US-221 (row 5): the skip link's target exists once on each screen", () => {
  const layout = read("../../app/layout.tsx");

  it("the root layout renders the skip link before everything else, and it targets #main", () => {
    expect(layout.indexOf("<SkipLink")).toBeGreaterThan(-1);
    expect(layout.indexOf("<SkipLink")).toBeLessThan(layout.indexOf("{children}"));
    expect(html(createElement("div", null, createElement(SkipLink, { label: "Skip" })))).toContain('href="#main"');
  });

  it("each bare screen has exactly one focusable #main region, and the empty wiki gets the shell's", () => {
    for (const props of [{ kind: "no-access" }, { kind: "no-cache", retryHref: "/w/x" }] as const) {
      const out = html(createElement(UnavailableView, props));
      expect(out.match(/id="main"/g), props.kind).toHaveLength(1);
      expect(out).toContain('id="main" tabindex="-1"');
    }
    const shell = html(createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: createElement(UnavailableView, { kind: "empty" }) }));
    expect(shell.match(/id="main"/g)).toHaveLength(1);
    expect(shell).toContain('id="main" tabindex="-1" data-testid="reader-content"');
  });
});
