import { describe, expect, it } from "vitest";

import { applyTheme, parseTheme, serializeThemeCookie, themeAttribute, type ThemeTarget } from "./theme";

function fakeDoc(protocol = "http:", throwOnCookie = false): ThemeTarget & { written: string[] } {
  const written: string[] = [];
  const doc = {
    documentElement: { dataset: {} as DOMStringMap },
    location: { protocol },
    written,
    get cookie() {
      return "";
    },
    set cookie(v: string) {
      if (throwOnCookie) throw new Error("blocked");
      written.push(v);
    },
  };
  return doc;
}

describe("US-172 theme cookie helper", () => {
  it("parses the three values and treats everything else as system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    for (const bad of [undefined, null, "", "purple", '{"a":1}', "DARK", " dark", 1]) expect(parseTheme(bad)).toBe("system");
  });

  it("renders an attribute for light and dark and none for system", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeUndefined();
  });

  it("serialises Path, Max-Age of one year, SameSite=Lax, and Secure only on https", () => {
    expect(serializeThemeCookie("dark", false)).toBe("theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(serializeThemeCookie("light", true)).toBe("theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("applies the attribute, removes it for system, and writes the cookie", () => {
    const doc = fakeDoc("https:");
    applyTheme(doc, "dark");
    expect(doc.documentElement.dataset.theme).toBe("dark");
    applyTheme(doc, "system");
    expect(doc.documentElement.dataset.theme).toBeUndefined();
    expect(doc.written).toEqual([serializeThemeCookie("dark", true), serializeThemeCookie("system", true)]);
  });

  it("keeps the choice for this view when the cookie write throws, without throwing", () => {
    const doc = fakeDoc("http:", true);
    expect(() => applyTheme(doc, "light")).not.toThrow();
    expect(doc.documentElement.dataset.theme).toBe("light");
  });
});
