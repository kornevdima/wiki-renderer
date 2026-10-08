import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-171, TC-501 (NFR-013, NFR-005): the font wiring as text. `next/font/local` cannot be imported under vitest, so the
 * module, the layout and the installed `esg-theme.css` are read as source; the rendered result is the e2e spec's (`fonts.spec.ts`).
 */

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
// The font stacks and the ligature rule moved with the rest of the token layer into the installed theme (US-216, ADR-020).
const css = read("./esg-theme.css");
const fonts = read("../fonts/index.ts");
const layout = read("./layout.tsx");

describe("self-hosted fonts (US-171)", () => {
  it("ships the design system's files and both OFL licences next to them", () => {
    for (const f of ["Figtree-latin.woff2", "Lilex-latin.woff2", "Figtree-OFL.txt", "Lilex-OFL.txt"]) {
      expect(existsSync(fileURLToPath(new URL(`../fonts/${f}`, import.meta.url))), f).toBe(true);
    }
  });

  it("loads both through next/font/local with the tokens v9 weight ranges, swap, Figtree's fallback adjustment left on and Lilex's off", () => {
    expect(fonts).toMatch(/from "next\/font\/local"/);
    expect(fonts).toMatch(/src: "\.\/Figtree-latin\.woff2",\s*weight: "300 900"/);
    expect(fonts).toMatch(/src: "\.\/Lilex-latin\.woff2",\s*weight: "100 700"/);
    expect(fonts.match(/display: "swap"/g)).toHaveLength(2);
    // Figtree keeps the default; only Lilex (mono, so an Arial fallback would be proportional) turns it off.
    expect(fonts.match(/adjustFontFallback\s*:/g)).toHaveLength(1);
    expect(fonts).toMatch(/src: "\.\/Lilex-latin\.woff2"[\s\S]*?adjustFontFallback: false/);
    expect(fonts).not.toMatch(/https?:\/\//);
  });

  it("publishes the variables on <html>", () => {
    expect(layout).toMatch(/<html lang=\{locale\} className=\{fontVariableClasses\} data-theme=\{themeAttribute\(theme\)\}>/);
  });

  it("puts each font first in the theme's family stacks", () => {
    expect(css).toContain('--font-sans: var(--font-figtree), system-ui, -apple-system, "Segoe UI", sans-serif;');
    expect(css).toContain(
      '--font-mono: var(--font-lilex), ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;',
    );
  });

  it("turns ligatures off on code, pre, kbd and samp", () => {
    const at = css.indexOf("  code,\n  pre,\n  kbd,\n  samp {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toMatch(/font-variant-ligatures:\s*none/);
  });
});
