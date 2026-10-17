import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGE_WIDTH_BREAKPOINT_PX, PRINT_MARGIN_MM } from "@/lib/page-width";

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
    expect(prose).toMatch(/@media screen and \(min-width: 1200px\)\s*\{\s*html\[data-page-width\^="a4"\] \.wr-column\[data-width-scope\] \.wr-prose\s*\{\s*@apply wr-print-type/);
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

  it("keeps the rail beside the article at every width: any rule that moves it under is inside an A4 fit container query", () => {
    // Every rule that changes the rail's place for a width (static rail, hidden rail copy, folded copy, single-track grid) sits in a @container block.
    const outside = reader.replace(/@container[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, "");
    for (const m of outside.matchAll(/(html\[data-page-width[^{]*)\{([^}]*)\}/g)) {
      if (/\.wr-layout--aside\s*$/.test(m[1]!)) expect(m[2], m[0]).toMatch(/var\(--sidebar-w\)/);
      expect(m[1], m[0]).not.toMatch(/\.wr-(rail|toc--rail|toc--inline)\b/);
    }
  });

  it("moves the rail under only when the A4 article plus the rail's room does not fit the slot (the fit rule)", () => {
    const containers = [...reader.matchAll(/@container\s*\(width < calc\((\d+)mm \+ (\d+)px\)\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    // A4 content width is the sheet less the 10mm margins: 190mm portrait, 277mm landscape.
    expect(containers.map((m) => [m[1], m[2]])).toEqual([["190", "324"], ["277", "324"]]);
    expect(containers[0]![3]).toContain('data-page-width="a4-portrait"');
    expect(containers[0]![3]).not.toContain("a4-landscape");
    expect(containers[1]![3]).toContain('data-page-width="a4-landscape"');
    expect(containers[1]![3]).not.toContain("a4-portrait");
    for (const c of containers) {
      expect(c[3]).toMatch(/\.wr-rail\s*\{[^}]*position:\s*static/);
      expect(c[3]).toMatch(/\.wr-layout--aside\s*\{[^}]*grid-template-columns:\s*minmax\(0, var\(--wr-page-px\)\)/);
    }
    // The room the rail takes is the theme's gap and column, in px, because a container condition cannot read a custom property.
    const theme = strip(readFileSync(join(HERE, "esg-theme.css"), "utf8"));
    const px = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(theme)![1]);
    expect(px("--space-60") + px("--sidebar-w")).toBe(324);
    expect(reader).toMatch(/div:has\(> \.wr-column\[data-width-scope\]\)\s*\{\s*container-type:\s*inline-size/);
  });
});
