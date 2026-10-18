/**
 * The interface language is always English (US-098 L3, W8-4, W8-5, TC-464). The Language choice itself is one inline radio
 * group in the settings menu (US-286); these pin the config behind it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import messages from "../../messages/en.json";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "./i18n";

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("cookies() must not be read by the i18n config");
  },
  headers: () => {
    throw new Error("headers() must not be read by the i18n config");
  },
}));

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("the interface language is always English", () => {
  it("LOCALES is exactly ['en'] and only 'en' is a locale", () => {
    expect([...LOCALES]).toEqual(["en"]);
    expect(DEFAULT_LOCALE).toBe("en");
    for (const v of ["uk", "de", "EN", "en-US", "", null, undefined]) expect(isLocale(v)).toBe(false);
  });

  it("the request config returns en and en messages without reading a cookie, a header or a query", async () => {
    vi.stubEnv("WIKI_DIRS", "w=/tmp/w");
    const mod = await import("../i18n/request");
    const config = await (mod.default as unknown as () => Promise<{ locale: string; messages: Record<string, unknown> }>)();
    expect(config.locale).toBe("en");
    // The messages as shipped, plus the one thing the default branding adds: the WR mark as the brand's logo (US-289).
    expect(config.messages).toEqual({ ...messages, brand: { ...(messages as { brand: object }).brand, logo: "/wr-mark.svg" } });
    vi.unstubAllEnvs();
  });

  it("the config and the root layout have no locale detection", () => {
    const src = read("../i18n/request.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/next\/headers|cookies|NEXT_LOCALE|Accept-Language|searchParams|\blang\b|negotiat|\?locale/i);
    const layout = read("../app/layout.tsx");
    expect(layout).toMatch(/<html lang=\{locale\}/);
    expect(layout).not.toMatch(/NEXT_LOCALE|Accept-Language|searchParams/i);
  });

  it("there is one messages file, en.json", () => {
    expect(readdirSync(fileURLToPath(new URL("../../messages/", import.meta.url))).sort()).toEqual(["en.json"]);
  });
});

describe("US-286 the settings menu's Language group", () => {
  it("lists every LOCALES entry as an inline radio item under a label, with English checked and the copy accepted", () => {
    const src = read("../components/app-settings-menu.tsx");
    expect(src).toContain("DropdownMenuLabel");
    expect(src).toContain("DropdownMenuRadioGroup");
    expect(src).toContain("LOCALES.map");
    expect(messages.settingsMenu).toEqual({ label: "Settings", settings: "Settings" });
    expect(messages.localeSwitcher).toEqual({ label: "Language", en: "English" });
  });
});
