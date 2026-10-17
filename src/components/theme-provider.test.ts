/**
 * Specs for the theme provider (US-172) and its settings-menu wiring (US-286). The behaviour in a browser (menu, keyboard, cookie,
 * first paint) is e2e; this pins the provider, the copy and the wiring.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// No DOM library here, so the provider's one `useState` is backed by a module cell while `shared.on` is set: a state
// written through one consumer survives into the next render, as it does across a soft navigation.
const shared = vi.hoisted(() => ({ on: false, value: undefined as unknown }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      if (!shared.on) return actual.useState(initial);
      if (shared.value === undefined) shared.value = initial;
      return [shared.value, (next: unknown) => (shared.value = next)];
    }) as typeof actual.useState,
  };
});

import messages from "../../messages/en.json";
import { ThemeProvider, useTheme, type ThemeState } from "./theme-provider";
import type { ThemeChoice } from "../lib/theme";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
function html(element: ReactElement, choice: ThemeChoice): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages,
      children: createElement(ThemeProvider, { choice, children: element }),
    }),
  );
}

describe("US-172 theme copy and wiring", () => {
  it("the copy is exactly the accepted strings", () => {
    expect(messages.theme).toEqual({ label: "Theme", light: "Light", dark: "Dark", system: "System" });
  });

  it("the root layout reads the cookie on the server and carries no inline script", () => {
    const layout = read("../app/layout.tsx");
    expect(layout).toContain("cookieStore.get(THEME_COOKIE)");
    expect(layout).toContain("data-theme={themeAttribute(theme)}");
    expect(layout).not.toMatch(/<script|dangerouslySetInnerHTML/);
  });

  it("the settings menu is mounted in the home topbar and the reader topbar, feeds the menu from useTheme, and the old controls are gone", () => {
    expect(read("../app/page.tsx")).toContain("<AppSettingsMenu />");
    expect(read("./reader/page-shell.tsx")).toContain("<AppSettingsMenu />");
    expect(read("./app-settings-menu.tsx")).toMatch(/useTheme\(\)[\s\S]*onValueChange: set/);
    expect(read("../app/not-found.tsx")).not.toMatch(/Theme(Control|Select)|AppSettingsMenu/);
    for (const file of ["../app/page.tsx", "./reader/page-shell.tsx", "./reader/reader-sidebar.tsx"]) {
      expect(read(file)).not.toMatch(/ThemeControl|ThemeSelect|LocaleSwitcher/);
    }
  });
});

describe("US-172 the provider owns the choice", () => {
  it("a pick through one consumer is seen by a second consumer mounted afterwards", () => {
    const written: Record<string, string | undefined> = {};
    const fakeDocument = {
      documentElement: { dataset: written as unknown as DOMStringMap },
      cookie: "",
      location: { protocol: "http:" },
    };
    vi.stubGlobal("document", fakeDocument);
    shared.on = true;
    shared.value = undefined;
    try {
      let state: ThemeState | undefined;
      const Probe = () => {
        state = useTheme();
        return null;
      };
      // First page: the layout renders "system"; the viewer picks Dark.
      expect(html(createElement(Probe), "system")).toBe("");
      expect((state as ThemeState).choice).toBe("system");
      (state as ThemeState).set("dark");
      expect(written.theme, "applyTheme ran").toBe("dark");
      // A soft navigation mounts a different consumer under the same provider; the layout still says "system".
      html(createElement(Probe), "system");
      expect((state as ThemeState).choice).toBe("dark");
    } finally {
      shared.on = false;
      vi.unstubAllGlobals();
    }
  });
});
