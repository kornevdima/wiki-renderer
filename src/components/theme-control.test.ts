/**
 * Component and wiring specs for the theme control (US-172). The behaviour in a browser (popover, keyboard, cookie,
 * first paint) is the e2e spec `tests/e2e/theme.spec.ts`; this pins the server-rendered shape and the layout's wiring.
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
import { ThemeControl, ThemeProvider, ThemeSelect, useTheme, type ThemeState } from "./theme-control";
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

describe("US-172 theme control, server-rendered", () => {
  it("the app button is named for the stored choice", () => {
    for (const choice of ["light", "dark", "system"] as const) {
      expect(html(createElement(ThemeControl), choice)).toContain(`aria-label="Theme: ${choice}"`);
    }
  });

  it("the icon follows the choice: sun, moon, monitor", () => {
    expect(html(createElement(ThemeControl), "light")).toContain("lucide-sun");
    expect(html(createElement(ThemeControl), "dark")).toContain("lucide-moon");
    expect(html(createElement(ThemeControl), "system")).toContain("lucide-monitor");
  });

  it("the reader select is named Theme and shows the stored choice's label", () => {
    const out = html(createElement(ThemeSelect), "dark");
    expect(out).toContain('aria-label="Theme"');
    expect(out).toContain("lucide-moon");
    expect(out).toContain(">Dark</span>");
  });

  it("the copy is exactly the accepted strings", () => {
    expect(messages.theme).toEqual({ label: "Theme", buttonLabel: "Theme: {value}", light: "Light", dark: "Dark", system: "System" });
  });

  it("the root layout reads the cookie on the server and carries no inline script", () => {
    const layout = read("../app/layout.tsx");
    expect(layout).toContain("cookies()).get(THEME_COOKIE)");
    expect(layout).toContain("data-theme={themeAttribute(theme)}");
    expect(layout).not.toMatch(/<script|dangerouslySetInnerHTML/);
  });

  it("the control is mounted in the home topbar and the reader header, and not on the 404", () => {
    expect(read("../app/page.tsx")).toContain("<ThemeControl />");
    expect(read("./reader/page-shell.tsx")).toContain("<ThemeSelect />");
    expect(read("../app/not-found.tsx")).not.toMatch(/Theme(Control|Select)/);
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
      expect(html(createElement("div", null, createElement(Probe), createElement(ThemeControl)), "system")).toContain("Theme: system");
      (state as ThemeState).set("dark");
      expect(written.theme, "applyTheme ran").toBe("dark");
      // A soft navigation mounts a different control under the same provider; the layout still says "system".
      expect(html(createElement(ThemeControl), "system")).toContain("Theme: dark");
      expect(html(createElement(ThemeSelect), "system")).toContain(">Dark</span>");
    } finally {
      shared.on = false;
      vi.unstubAllGlobals();
    }
  });
});
