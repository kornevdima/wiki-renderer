/**
 * Component and config specs for the English-only locale switcher (US-098 contract L1-L4, W8-4, W8-5, TC-464).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";
import { PageShell } from "./reader/page-shell";
import { LocaleSwitcher } from "./locale-switcher";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "../lib/i18n";

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("cookies() must not be read by the i18n config");
  },
  headers: () => {
    throw new Error("headers() must not be read by the i18n config");
  },
}));

function html(element: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: element }));
}
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const count = (out: string, re: RegExp) => (out.match(re) ?? []).length;

const SWITCHER_PROPS = { label: "Language", optionLabels: { en: "English" } };
const SELECT = /<label data-testid="locale-switcher">Language <select id="locale-switcher-select" name="locale"><option value="en" selected="">English<\/option><\/select><\/label>/;

describe("L1 (US-098 S1, S4): one labelled select with one option, enabled", () => {
  it("the switcher markup, verbatim: a real label, value en, text English, not disabled", () => {
    const out = html(createElement(LocaleSwitcher, SWITCHER_PROPS));
    expect(out).toMatch(SELECT);
    expect(out).not.toMatch(/disabled|tabindex|onchange/i);
  });

  it("the reader has exactly one, in the sidebar foot after All wikis, with its visible label (US-187)", () => {
    const out = html(createElement(PageShell, { wikiId: "w", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: null, children: null }));
    // The Theme select (US-172) is a Radix select with its own hidden native select, so count the Language one by id.
    expect(count(out, /<select id="locale-switcher-select"/g)).toBe(1);
    expect(out).toMatch(/data-testid="reader-sidebar".*All wikis<\/a>.*<label data-testid="locale-switcher"[^>]*>Language <span class="relative block">.*lucide-globe.*<select id="locale-switcher-select".*<\/select><\/span><\/label><\/div><\/div>/);
    expect(out.indexOf('<select id="locale-switcher-select"')).toBeLessThan(out.indexOf('data-testid="app-header"'));
  });
});

describe("L3 (US-098 S3, TC-464): the interface language is always English", () => {
  it("LOCALES is exactly ['en'] and only 'en' is a locale", () => {
    expect([...LOCALES]).toEqual(["en"]);
    expect(DEFAULT_LOCALE).toBe("en");
    for (const v of ["uk", "de", "EN", "en-US", "", null, undefined]) expect(isLocale(v)).toBe(false);
  });

  it("the request config returns en and en messages without reading a cookie, a header or a query", async () => {
    const mod = await import("../i18n/request");
    const config = await (mod.default as unknown as () => Promise<{ locale: string; messages: Record<string, unknown> }>)();
    expect(config.locale).toBe("en");
    expect(config.messages).toEqual(messages);
  });

  it("the config and the root layout have no locale detection: no cookies, headers, NEXT_LOCALE, Accept-Language, locale/lang query", () => {
    for (const file of ["../i18n/request.ts"]) {
      const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src).not.toMatch(/next\/headers|cookies|NEXT_LOCALE|Accept-Language|searchParams|\blang\b|negotiat|\?locale/i);
    }
    const layout = read("../app/layout.tsx");
    // Pins the language only; other <html> attributes (class, data-theme) are other stories' to change.
    expect(layout).toMatch(/<html lang=\{locale\}/);
    expect(layout).not.toMatch(/NEXT_LOCALE|Accept-Language|searchParams/i);
  });

  it("there is one messages file, en.json", () => {
    const dir = fileURLToPath(new URL("../../messages/", import.meta.url));
    expect(readdirSyncSorted(dir)).toEqual(["en.json"]);
  });
});

describe("L4: the wiki-switcher pin is untouched", () => {
  it("the new component's path and source carry no WikiSwitcher identifier", () => {
    expect(read("./locale-switcher.tsx")).not.toMatch(/WikiSwitcher/i);
    expect("components/locale-switcher.tsx").not.toMatch(/wiki-switcher/i);
  });
});

import { readdirSync } from "node:fs";
function readdirSyncSorted(dir: string): string[] {
  return readdirSync(dir).sort();
}

describe("US-212 R12: the optional leading glyph", () => {
  it("without an icon the markup is unchanged", () => {
    expect(html(createElement(LocaleSwitcher, SWITCHER_PROPS))).toMatch(SELECT);
  });
});
