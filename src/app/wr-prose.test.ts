import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-189 (NFR-013, FR-037, FR-038; contract rows 3 and 7): pins on the reader's content stylesheet that no browser is
 * needed for. The icons are files on the app's own origin drawn as masks (no `data:` URL, so the CSP stays as it is), the
 * old "↗" glyph rule is gone, and Tailwind Typography and every `prose` class are gone.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "../..");
const read = (p: string): string => readFileSync(p, "utf8");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const wrProse = read(join(HERE, "wr-prose.css"));
const globals = read(join(HERE, "globals.css"));
const wrProseCode = stripComments(wrProse);
const globalsCode = stripComments(globals);
// The token layer, the base layer, the focus outline and the print chrome come from the installed registry theme (US-216, ADR-020).
const themeCode = stripComments(read(join(HERE, "esg-theme.css")));

describe("wr-prose.css: icons are files from the app's origin, drawn as masks", () => {
  const declared = [...wrProseCode.matchAll(/(--wr-icon-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const);

  it("declares exactly the thirteen icons, each a root-relative url() to an SVG under /icons that exists in public/", () => {
    expect(declared.map(([name]) => name).sort()).toEqual([
      "--wr-icon-callout-danger",
      "--wr-icon-callout-default",
      "--wr-icon-callout-important",
      "--wr-icon-callout-info",
      "--wr-icon-callout-note",
      "--wr-icon-callout-success",
      "--wr-icon-callout-tip",
      "--wr-icon-callout-warning",
      "--wr-icon-chevron-right",
      "--wr-icon-external",
      "--wr-icon-hash",
      "--wr-icon-link-off",
      "--wr-icon-tick",
    ]);
    for (const [name, value] of declared) {
      const file = /^url\("(\/icons\/[a-z-]+\.svg)"\)$/.exec(value)?.[1];
      expect(file, `${name}: ${value}`).toBeDefined();
      expect(existsSync(join(WEB, "public", file!)), `public${file}`).toBe(true);
    }
  });

  it("each icon file is a plain SVG: no script, no external reference, no embedded data", () => {
    for (const file of readdirSync(join(WEB, "public/icons"))) {
      const svg = read(join(WEB, "public/icons", file));
      expect(svg, file).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/);
      expect(svg, file).not.toMatch(/<script|<style|<image|<foreignObject|href=|data:|on[a-z]+=/i);
    }
  });

  it("uses no data: URL and no inline SVG anywhere in the stylesheet or globals.css", () => {
    for (const [name, code] of [["wr-prose.css", wrProseCode], ["globals.css", globalsCode]] as const) {
      expect(code, name).not.toMatch(/data:/i);
      expect(code, name).not.toMatch(/<svg|%3Csvg/i);
    }
  });

  it("draws every icon through mask / -webkit-mask on a var(--wr-icon-*)", () => {
    const uses = [...wrProseCode.matchAll(/(-webkit-mask|mask):\s*([^;]+);/g)];
    expect(uses.length, "seven mask uses (external, link-off, tick, chevron, callout icon, embed marker, diagram error), each a mask / -webkit-mask pair").toBe(14);
    for (const m of uses) expect(m[2], m[0]).toMatch(/^var\((--wr-icon-[a-z-]+|--callout-icon)\) center \/ contain no-repeat$/);
    const webkit = uses.filter((m) => m[1] === "-webkit-mask").length;
    expect(webkit, "each mask has its -webkit- pair").toBe(uses.length - webkit);
  });

  it("styles the external link icon, the unavailable indicator and the Properties marker with the files", () => {
    expect(wrProseCode).toMatch(/\.wr-prose \.external-link-icon\s*\{[^}]*var\(--wr-icon-external\)/);
    expect(wrProseCode).toMatch(/\.wr-prose \.wikilink-unavailable-indicator,\s*\.wr-properties \.wikilink-unavailable-indicator\s*\{[^}]*var\(--wr-icon-link-off\)/);
  });
});

describe("the old glyph and the old overrides are gone", () => {
  it('has no "↗" glyph rule and no ::after content on the external link icon', () => {
    for (const css of [wrProse, globals]) {
      expect(css).not.toContain("\u2197");
      expect(css.toLowerCase()).not.toContain("\\2197");
    }
    expect(globalsCode).not.toMatch(/\.external-link-icon::after/);
  });

  it("keeps the hidden-text rule for the external and unavailable markers (assistive technology still reads them)", () => {
    expect(globalsCode).toMatch(/\.wikilink-unavailable-text,\s*\.external-link-text\s*\{[^}]*clip-path:\s*inset\(50%\)/);
  });
});

describe("Typography is removed (contract row 7)", () => {
  it("package.json no longer depends on @tailwindcss/typography and globals.css no longer loads a plugin", () => {
    const pkg = JSON.parse(read(join(WEB, "package.json"))) as { dependencies?: object; devDependencies?: object };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("@tailwindcss/typography");
    expect(globalsCode).not.toMatch(/@plugin/);
    expect(globalsCode).toContain('@import "./wr-prose.css"');
  });

  it("neither stylesheet has a `.prose` selector or a --tw-prose variable", () => {
    for (const css of [wrProseCode, globalsCode]) {
      expect(css).not.toMatch(/(?<![\w-])\.prose(?![\w-])/);
      expect(css).not.toContain("--tw-prose");
    }
  });

  it("no source file puts a `prose` class on anything", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|css)$/.test(name) && !/\.(test|itest)\.tsx?$/.test(name)) {
          (name.endsWith(".css") ? stripComments(read(path)) : read(path)).split("\n").forEach((line, i) => {
            if (/["'`][^"'`\n]*(?<![\w-])prose(?![\w-])[^"'`\n]*["'`]/.test(line) || /(?<![\w-])\.prose(?![\w-])/.test(line)) hits.push(`${path.slice(WEB.length + 1)}:${i + 1}`);
          });
        }
      }
    };
    walk(join(WEB, "src"));
    expect(hits).toEqual([]);
  });
});

describe("the content stylesheet's table and measure", () => {
  it("makes a table its own scroll box (display: block; overflow-x: auto) with a focus outline", () => {
    expect(wrProseCode).toMatch(/\.wr-prose table\s*\{[^}]*display:\s*block;[^}]*overflow-x:\s*auto/);
    expect(wrProseCode).toMatch(/\.wr-prose table:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
  });

  it("holds the article to the measure token (36em, 576px at 16px) at 16/24 and leaves anchor landing to the page's one scroll-padding (US-212)", () => {
    expect(wrProseCode).toMatch(/\.wr-prose\s*\{[^}]*max-width:\s*var\(--measure\);[^}]*font-size:\s*16px;[^}]*line-height:\s*24px/);
    // One mechanism: `html { scroll-padding-top }` in the installed theme (topbar + focus ring + gap). A margin here would stack on it.
    expect(wrProseCode).not.toMatch(/scroll-margin/);
    expect(themeCode).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--topbar-h\)/);
  });
});

describe("Shiki's css-variables theme in the content stylesheet (US-190, ADR-010 amendment 2026-10-05)", () => {
  it("globals.css and the installed esg-theme.css have no pre.shiki rule left (the dual-theme remap is gone), so nothing competes with `.wr-prose pre` by order", () => {
    expect(globalsCode).not.toMatch(/(^|[\s,}])pre\.shiki(?![\w-])/);
    expect(globalsCode).not.toMatch(/--shiki-/);
    expect(themeCode).not.toMatch(/(^|[\s,}])pre\.shiki(?![\w-])/);
    expect(themeCode).not.toMatch(/--shiki-/);
    expect(wrProseCode).not.toMatch(/--shiki-(light|dark)/);
    // The one remaining Shiki-specific block rule lives in wr-prose.css itself, after the generic `pre` rule, at higher specificity.
    expect(wrProseCode.indexOf(".wr-prose pre.shiki .line")).toBeGreaterThan(wrProseCode.indexOf(".wr-prose pre {"));
  });

  it("styles a comment span italic from the stylesheet, not from the token style", () => {
    expect(wrProseCode).toMatch(/\.wr-prose \.shiki span\[style\*="--shiki-token-comment"\]\s*\{\s*font-style:\s*italic;\s*\}/);
  });

  it("puts a fence inside a callout on the page colour, Shiki's included", () => {
    expect(wrProseCode).toMatch(/\.wr-prose \.callout :where\(pre, table, \.callout, \.note-embed\)\s*\{\s*background-color:\s*var\(--background\);\s*\}/);
    expect(wrProseCode).toMatch(/\.wr-prose \.callout pre\.shiki\s*\{\s*background-color:\s*var\(--background\);\s*\}/);
  });
});

describe("callouts and note embeds (US-191)", () => {
  it("has a file for every callout icon, each drawn by the one --callout-icon mask", () => {
    for (const type of ["note", "info", "tip", "success", "important", "warning", "danger", "default"]) {
      expect(existsSync(join(WEB, "public/icons", `callout-${type}.svg`)), type).toBe(true);
      expect(wrProseCode).toContain(`--wr-icon-callout-${type}: url("/icons/callout-${type}.svg")`);
    }
    expect(wrProseCode).toMatch(/\.wr-prose \.callout-icon\s*\{[^}]*mask:\s*var\(--callout-icon\) center \/ contain no-repeat/);
  });

  it("gives the seven types their own rule and leaves every other word on the default", () => {
    for (const type of ["note", "info", "tip", "success", "important", "warning", "danger"]) {
      expect(wrProseCode, type).toMatch(new RegExp(`\\.wr-prose \\.callout-${type}\\s*\\{[^}]*--wr-icon-callout-${type}\\)`));
    }
    expect(wrProseCode).not.toMatch(/\.callout-(quote|example|question|bug|abstract|default)\s*\{/);
    expect(wrProseCode).toMatch(/\.wr-prose \.callout\s*\{[^}]*--callout-icon:\s*var\(--wr-icon-callout-default\)/);
  });

  it("marks a stopped embed with a dashed border and the info icon", () => {
    expect(wrProseCode).toMatch(/\.wr-prose \.embed-marker\s*\{[^}]*border:\s*1px dashed var\(--border-strong\)/);
    expect(wrProseCode).toMatch(/\.wr-prose \.embed-marker::before\s*\{[^}]*var\(--wr-icon-callout-info\)/);
  });

  it("prints callouts and note embeds in colour and whole", () => {
    const print = wrProseCode.slice(wrProseCode.indexOf("@media print"));
    expect(print).toMatch(/:where\([^)]*\.callout[^)]*\.note-embed[^)]*\)\s*\{\s*break-inside:\s*avoid/);
    expect(print).toMatch(/:where\(\.callout, \.note-embed[^)]*\)\s*\{\s*-webkit-print-color-adjust:\s*exact;\s*print-color-adjust:\s*exact/);
  });
});

describe("the kit EmptyState inside the content column (US-195)", () => {
  it("has its own unlayered rule zeroing the h1 and p margins, scoped to the empty-state slot (a utility class cannot win: this file is unlayered)", () => {
    expect(wrProseCode).toMatch(/\.wr-prose \[data-slot="empty-state"\] :is\(h1, p\)\s*\{\s*margin:\s*0;\s*\}/);
    expect(wrProseCode.indexOf('[data-slot="empty-state"] :is(h1, p)')).toBeGreaterThan(wrProseCode.indexOf(".wr-prose h1 {"));
  });
});

/** US-196 (NFR-008, FR-044, ADR-013): the print rules are consolidated, each declaration written once. */
describe("print rules: one list each, and no declaration written in both files (US-196)", () => {
  /** The body of the first block opened by `opener` in comment-free `code`, balanced on braces. */
  function blockOf(code: string, opener: string): string {
    const at = code.indexOf(opener);
    if (at < 0) throw new Error(`no block opened by ${opener}`);
    const open = code.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) return code.slice(open + 1, i);
      }
    }
    throw new Error("unclosed block");
  }
  /** Splits on commas outside parentheses. */
  function splitTop(list: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of list) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  /** `selector|property` keys for every declaration in a print block; `.wr-prose` scoping and `:where()` lists are normalised away. */
  function printKeys(code: string): string[] {
    const block = blockOf(code, "@media print");
    const keys: string[] = [];
    for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = [...new Set([...m[2]!.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]!.replace(/^-webkit-/, "")))];
      const selectors: string[] = [];
      for (const raw of splitTop(m[1]!.trim())) {
        const sel = raw.replace(/\s+/g, " ");
        const where = /^(?:\.wr-prose|:where\(\.wr-prose, \.wr-properties\)) :where\((.*)\)$/s.exec(sel);
        if (where) selectors.push(...splitTop(where[1]!));
        else selectors.push(sel.replace(/^\.wr-prose /, ""));
      }
      for (const s of selectors) for (const p of props) keys.push(`${s.replace(/\s+/g, " ")}|${p}`);
    }
    return keys;
  }

  it("has exactly one print block in each file, and none repeats a selector and property of the other or of itself", () => {
    expect(wrProseCode.match(/@media print/g)).toHaveLength(1);
    // globals.css holds no print rule of its own any more: the shell, scheme and dialog hide are the theme's one block.
    expect(globalsCode.match(/@media print/g)).toBeNull();
    expect(themeCode.match(/@media print/g)).toHaveLength(1);
    const keys = [...printKeys(wrProseCode), ...printKeys(themeCode)];
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("keeps the page-content print rules in wr-prose.css and only the shell, scheme and dialog hide in the installed theme", () => {
    const globalsPrint = blockOf(themeCode, "@media print");
    expect(globalsPrint).not.toMatch(/break-inside|print-color-adjust|data-mermaid-id|\.wr-prose|\.callout|\.note-embed/);
    expect(globalsPrint).toMatch(/\[data-slot="dialog-overlay"\],\s*\[data-slot="dialog-content"\]\s*\{\s*display:\s*none/);
    expect(globalsPrint).toMatch(/#app-nav\s*\{\s*display:\s*none/);
    expect(globalsPrint).toMatch(/div:has\(> #app-nav\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(globalsPrint).toMatch(/#app-nav \+ \[aria-hidden="true"\]\s*\{\s*display:\s*none/);
    expect(globalsPrint).toMatch(/#app-nav ~ \*\s*\{\s*grid-column-start:\s*1/);
  });

  it("has one break-inside list and one exact-colour list", () => {
    const print = blockOf(wrProseCode, "@media print");
    const breakRules = [...print.matchAll(/([^{}]+)\{[^{}]*break-inside:\s*avoid[^{}]*\}/g)];
    expect(breakRules).toHaveLength(1);
    const breakList = splitTop(/:where\((.*)\)/s.exec(breakRules[0]![1]!)![1]!);
    expect(breakList.sort()).toEqual(["[data-mermaid-id]", ".callout", ".embed-marker", ".note-embed", "details", "img", "pre", "table"].sort());
    const exactRules = [...print.matchAll(/([^{}]+)\{[^{}]*print-color-adjust:\s*exact;[^{}]*\}/g)];
    expect(exactRules).toHaveLength(1);
    const exactMatch = /^\s*:where\(\.wr-prose, \.wr-properties\)\s+:where\((.*)\)\s*$/s.exec(exactRules[0]![1]!);
    expect(exactMatch).not.toBeNull();
    const exactList = splitTop(exactMatch![1]!.replace(/\s+/g, " "));
    expect(exactList.sort()).toEqual(
      [".callout", ".note-embed", ".task-list-item > input", "pre", "thead th", ".wikilink-unavailable-indicator", ".embed-marker", "[data-mermaid-error]", "summary"].sort(),
    );
  });

  it("normalises the exact-colour rule to one key per member, nine in all, and sees a repeated pair (US-207, BUG-039)", () => {
    const members = [".callout", ".note-embed", ".task-list-item > input", "pre", "thead th", ".wikilink-unavailable-indicator", ".embed-marker", "[data-mermaid-error]", "summary"];
    const exactKeys = printKeys(wrProseCode).filter((k) => k.endsWith("|print-color-adjust"));
    expect(exactKeys.sort()).toEqual(members.map((m) => `${m}|print-color-adjust`).sort());
    // A parser fed a repeated pair must report it, so the no-duplicates pin above is not vacuous.
    const twice = "@media print {\n  .wr-prose :where(pre) {\n    print-color-adjust: exact;\n  }\n  :where(.wr-prose, .wr-properties)\n      :where(pre, summary) {\n    print-color-adjust: exact;\n  }\n}";
    const keys = printKeys(twice);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual(["pre|print-color-adjust"]);
  });

  it("shows a closed details' content in print without turning the summary into a block, so its chevron keeps its box (US-207, BUG-040)", () => {
    const print = blockOf(wrProseCode, "@media print");
    expect(print).toMatch(/\.wr-prose details > :not\(summary\)\s*\{\s*display:\s*block/);
    expect(print).not.toMatch(/details > \*/);
    // Chromium hides a closed details' body in the ::details-content slot; print reveals it there (a slot, not generated content).
    expect(print).toMatch(/\.wr-prose details::details-content\s*\{\s*content-visibility:\s*visible/);
    expect(wrProseCode.slice(0, wrProseCode.indexOf("@media print"))).not.toMatch(/details-content/);
  });

  it("hides a diagram's raw fence source in print here, and adds no generated content or colour literal", () => {
    const print = blockOf(wrProseCode, "@media print");
    expect(print).toMatch(/\.wr-prose \[data-mermaid-id\] > pre\s*\{\s*display:\s*none/);
    expect(print).not.toMatch(/content\s*:|::before|::after|#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i);
    expect(print).toMatch(/\.wr-prose a\s*\{\s*color:\s*var\(--foreground\)/);
  });
});

describe("wr-prose.css: the empty state's title keeps the kit's size (US-221)", () => {
  it("overrides `.wr-prose h1` for an EmptyState's h1 with the title tokens, so the empty wiki is 20/24, not 28/36", () => {
    const rule = /\.wr-prose \[data-slot="empty-state"\] h1\s*\{([^}]*)\}/.exec(wrProseCode);
    expect(rule, "the override rule exists").not.toBeNull();
    expect(rule![1]).toMatch(/font-size:\s*var\(--text-title\)\s*;/);
    expect(rule![1]).toMatch(/line-height:\s*var\(--text-title--line-height\)\s*;/);
  });
});
