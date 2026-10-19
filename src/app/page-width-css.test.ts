import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGE_WIDTH_BREAKPOINT_PX, PRINT_MARGIN_MM } from "@/lib/page-width";
import { RAIL_ROOM_PX } from "@/lib/sidebar";

const LAYOUT = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "layout");

/** US-280: pins on the page-width CSS that need no browser. The behaviour is proved in a browser (the e2e and the verification). */
const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const reader = strip(readFileSync(join(HERE, "wr-reader.css"), "utf8"));
const prose = strip(readFileSync(join(HERE, "wr-prose.css"), "utf8"));

describe("the print margin (US-280)", () => {
  it("declares one unnamed @page with the margin the guides assume, and nothing else", () => {
    const pages = [...reader.matchAll(/@page\s*([\w-]*)\s*\{([^}]*)\}/g)];
    expect(pages).toHaveLength(1);
    expect(pages[0]![1]).toBe("");
    expect(pages[0]![2].replace(/\s+/g, "")).toBe(`margin:${PRINT_MARGIN_MM}mm;`);
    expect(reader.match(/@page/g)).toHaveLength(1);
    expect(PRINT_MARGIN_MM).toBe(10);
  });

  it("never sets a page size or a named page, which would hide the print dialog's portrait / landscape control", () => {
    for (const css of [reader, prose]) {
      expect(css).not.toMatch(/(?<![\w-])size\s*:/);
      expect(css).not.toMatch(/(?<![\w-])page\s*:/);
      expect(css).not.toMatch(/@page\s+[\w-]/);
    }
  });

  it("gives the print column no px width: the slot padding goes and nothing fixes a width in print", () => {
    const start = reader.indexOf("@media print");
    const print = reader.slice(start, reader.indexOf("\n}\n", start));
    expect(print).toMatch(/div:has\(> \.wr-column\)\s*\{\s*padding:\s*0/);
    expect(print).not.toMatch(/(?<![\w-])(width|min-width)\s*:\s*[\d.]+px/);
    expect(print).toMatch(/\.wr-column,\s*\.wr-column:has\(\.wr-layout--aside\)\s*\{\s*max-width:\s*none/);
    const proseUtility = /@utility wr-print-type\s*\{([\s\S]*?)\n\}\n/.exec(prose)![1]!;
    expect(proseUtility).toMatch(/max-width:\s*none/);
    expect(proseUtility).not.toMatch(/(?<![\w-])(?:min-)?width\s*:\s*[\d.]+px/);
  });
});

describe("the A4 screen preview and print share one type scale (US-280)", () => {
  it("defines the scale once, as a utility, and applies it in print and at an A4 guide on screen", () => {
    expect(prose.match(/@utility wr-print-type/g)).toHaveLength(1);
    expect(prose.match(/@apply wr-print-type/g)).toHaveLength(2);
    expect(prose).toMatch(/@utility wr-print-type\s*\{[^@]*font-size:\s*11pt;/);
    expect(prose).toMatch(/@media screen and \(min-width: 1200px\)\s*\{\s*html\[data-page-width\^="a4"\] \.wr-column\[data-width-scope\] \.wr-prose:not\(:has\(> \.wr-source\)\)\s*\{\s*@apply wr-print-type/);
    expect(prose).toMatch(/@media print\s*\{\s*\.wr-prose\s*\{\s*@apply wr-print-type/);
  });

  it("writes no print font size outside the utility", () => {
    const outside = prose.replace(/@utility wr-print-type\s*\{[\s\S]*?\n\}\n/, "");
    expect(outside).not.toMatch(/font-size:\s*(11|20|16|13|9)pt/);
  });
});

describe("the page width's screen rules (US-280)", () => {
  it("apply from the 1200px the rail uses, on the rendered page only, and the A4 preview is gated the same", () => {
    expect(PAGE_WIDTH_BREAKPOINT_PX).toBe(1200);
    const screen = [...reader.matchAll(/@media screen and \(min-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(screen.length).toBeGreaterThan(1);
    for (const px of screen) expect(px).toBe(PAGE_WIDTH_BREAKPOINT_PX);
    for (const m of reader.matchAll(/html\[data-page-width[^{]*\{/g)) {
      if (m[0].includes("body {") || m[0].startsWith("html[data-page-width=\"full\"] {")) continue;
      expect(m[0], m[0]).toMatch(/data-width-scope|div:has/);
    }
  });

  it("gives the probe the same 16px as the article, so the Reading guide is the article's own 36em", () => {
    expect(reader).toMatch(/\.wr-width-probe\s*\{[^}]*font-size:\s*16px/);
    expect(prose).toMatch(/\.wr-prose\s*\{[^}]*font-size:\s*16px/);
    expect(reader).toMatch(/\.wr-width-probe\s*\{[^}]*width:\s*var\(--measure\)/);
  });

  it("keeps the rail beside the article at every width: no screen rule moves it under, and there is no fit container query (US-281)", () => {
    expect(reader).not.toMatch(/@container/);
    expect(reader).not.toMatch(/container-type/);
    for (const m of reader.matchAll(/(html\[data-page-width[^{]*)\{([^}]*)\}/g)) {
      if (/\.wr-layout--aside\s*$/.test(m[1]!)) expect(m[2], m[0]).toMatch(/var\(--sidebar-w\)/);
      expect(m[1], m[0]).not.toMatch(/\.wr-(rail|toc--rail)\b/);
    }
  });

  it("narrows the page, not the rail: the grid track is the page width held to the room beside the rail", () => {
    expect(reader).toMatch(/grid-template-columns:\s*minmax\(0, min\(var\(--wr-page-px, 100%\), calc\(100% - var\(--wr-extra\)\)\)\) var\(--sidebar-w\)/);
  });

  it("holds the rail's room in the theme: the gap and the column add up to RAIL_ROOM_PX", () => {
    const theme = strip(readFileSync(join(HERE, "esg-theme.css"), "utf8"));
    const px = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(theme)![1]);
    expect(px("--space-60") + px("--sidebar-w")).toBe(RAIL_ROOM_PX);
  });

  it("hides the sidebar's content in the collapsed strip from bp-lg only, and keeps the brand link's name (US-281)", () => {
    expect(reader).toMatch(/@media \(max-width: 1023\.98px\)\s*\{\s*aside\[data-slot="sidebar"\] \[data-slot="sidebar-footer"\]\s*\{\s*display:\s*none/);
    const strip1024 = reader.match(/@media \(min-width: 1024px\)\s*\{([\s\S]*?)\n\}/);
    expect(strip1024).not.toBeNull();
    expect(strip1024![1]).toMatch(/reader-sidebar-body"\] > \*\s*\{\s*display:\s*none/);
    expect(strip1024![1]).toMatch(/clip-path/);
    // Every rule that hides something in the strip: none may match the brand link, its name, the brand row, or the footer's button.
    const hiders = [...strip1024![1].matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /display:\s*none/.test(m[2]!)).map((m) => m[1]!.trim());
    expect(hiders).toEqual(['aside[data-slot="sidebar"][data-collapsed="true"] [data-testid="reader-sidebar-body"] > *']);
    for (const selector of hiders) expect(selector).not.toMatch(/brand|footer|sidebar-collapse"/);
  });
});

/**
 * F2 (US-281): the collapsed strip's CSS in wr-reader.css leans on the installed design system's own markup. A design-system update
 * that renames one of these must turn a test red here, not leave the strip silently un-hidden.
 */
describe("the strip CSS's dependencies on the installed design system (US-281)", () => {
  const sidebarSrc = readFileSync(join(LAYOUT, "sidebar.tsx"), "utf8");
  const brandSrc = readFileSync(join(LAYOUT, "brand.tsx"), "utf8");
  const theme = strip(readFileSync(join(HERE, "esg-theme.css"), "utf8"));
  const globals = strip(readFileSync(join(HERE, "globals.css"), "utf8"));

  it("the Sidebar is an aside with data-slot=sidebar and data-collapsed carrying the collapsed state", () => {
    expect(sidebarSrc).toMatch(/<aside[^>]*data-slot="sidebar"/);
    expect(sidebarSrc).toMatch(/<aside[^>]*data-collapsed=\{collapsed\}/);
    expect(reader).toContain('aside[data-slot="sidebar"][data-collapsed="true"]');
  });

  it("the footer is data-slot=sidebar-footer and the collapse button data-slot=sidebar-collapse, hidden below lg", () => {
    expect(sidebarSrc).toMatch(/data-slot="sidebar-footer"/);
    expect(sidebarSrc).toMatch(/data-slot="sidebar-collapse"/);
    expect(sidebarSrc).toMatch(/aria-pressed=\{collapsed\}/);
    expect(sidebarSrc).toContain("max-lg:hidden");
    expect(reader).toContain('[data-slot="sidebar-footer"]');
  });

  it("the Brand is data-testid=brand whose last child is the name span (what the strip visually hides)", () => {
    expect(brandSrc).toMatch(/data-testid="brand"/);
    const textSpanAt = brandSrc.indexOf("<span className={alwaysShowText");
    expect(textSpanAt).toBeGreaterThan(0);
    expect(brandSrc.slice(textSpanAt)).toMatch(/<\/span>\s*<\/Link>/); // the text span is the Link's last child
    expect(reader).toContain('[data-testid="brand"] > span:last-child');
  });

  it("bp-lg is Tailwind's default lg, 64rem = 1024 px: the theme does not redefine it, and the strip CSS uses 1024 / 1023.98", () => {
    expect(theme + globals).not.toMatch(/--breakpoint-lg\s*:/);
    expect(theme + globals).not.toMatch(/--breakpoint-\*\s*:/);
    expect(sidebarSrc).toContain("lg:"); // the DS's own collapsed styles key on lg
    expect(reader).toContain("@media (min-width: 1024px)");
    expect(reader).toContain("@media (max-width: 1023.98px)");
  });
});

