import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-218 (FR-024, FR-052, NFR-013; contract rows 3 to 5): pins on the reader's own layout and literal-text rules that need no
 * browser. The measure itself is proved in a browser (reader-measure.spec.ts); these keep the rules from being edited away.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string): string => readFileSync(p, "utf8");

const reader = stripComments(read(join(HERE, "wr-reader.css")));
const prose = stripComments(read(join(HERE, "wr-prose.css")));
const theme = stripComments(read(join(HERE, "esg-theme.css")));

/** Every top-level rule `selectors { body }` outside an at-rule block, as [selector list, body]. */
function rules(css: string): Array<[string[], string]> {
  const out: Array<[string[], string]> = [];
  const flat = css.replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, "$1");
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1]!.split(",").map((x) => x.trim()).filter(Boolean), m[2]!]);
  return out;
}

describe("the measure column (US-218)", () => {
  it("the installed theme defines --measure at 36em", () => {
    expect(theme).toMatch(/--measure:\s*36em;/);
  });

  it("the article, and the column that holds the page bar and notice with it, are held to the measure token", () => {
    expect(prose).toMatch(/\.wr-prose\s*\{[^}]*max-width:\s*var\(--measure\)/);
    expect(prose).not.toMatch(/\.wr-prose\s*\{[^}]*max-width:\s*\d+px/);
    expect(reader).toMatch(/\.wr-column\s*\{[^}]*max-width:\s*var\(--measure\);[^}]*justify-self:\s*center/);
    expect(reader).toMatch(/\.wr-column\s*\{[^}]*min-width:\s*0/);
    expect(reader).toMatch(/\.wr-column > \*\s*\{[^}]*min-width:\s*0/);
  });

  it("the right-hand column widens the column by its width and gap from 1200px, so the article stays at the measure", () => {
    expect(reader).toMatch(/@media \(min-width: 1200px\)\s*\{[\s\S]*\.wr-column:has\(\.wr-layout--aside\)\s*\{[^}]*calc\(var\(--measure\) \+ var\(--space-60\) \+ var\(--sidebar-w\)\)/);
    expect(reader).toMatch(/\.wr-layout--aside\s*\{[^}]*minmax\(0, var\(--measure\)\) var\(--sidebar-w\)/);
  });

  it("hides no overflow on html or body to pass a width check", () => {
    expect(reader).not.toMatch(/overflow-x:\s*hidden/);
  });
});

describe("literal text: Lilex with ligatures off (US-218)", () => {
  const ligaturesOff = rules(reader).find(([, body]) => /font-variant-ligatures:\s*none/.test(body));

  it("one unlayered rule turns ligatures off for code, pre, kbd, samp, var, tt and .wr-literal", () => {
    expect(ligaturesOff?.[0]).toEqual(["code", "pre", "kbd", "samp", "var", "tt", ".wr-literal"]);
    expect(ligaturesOff?.[1]).toMatch(/font-feature-settings:\s*"liga" 0, "calt" 0/);
  });

  it(".wr-literal sets Lilex through the mono token", () => {
    expect(rules(reader).find(([sel]) => sel.join() === ".wr-literal")?.[1]).toMatch(/font-family:\s*var\(--font-mono\)/);
  });

  it("every stylesheet rule that sets the mono family targets an element on the ligature list, .wr-literal or .wr-source (which turns them off itself)", () => {
    const covered = new Set(ligaturesOff?.[0]);
    const bad: string[] = [];
    for (const [name, css] of [["wr-prose.css", prose], ["wr-reader.css", reader]] as const) {
      for (const [selectors, body] of rules(css)) {
        if (!/font-family:\s*var\(--font-mono\)/.test(body)) continue;
        for (const selector of selectors) {
          const last = (selector.split(/[\s>+~]+/).pop() ?? "").replace(/:where\(|\)/g, "");
          const tags = last.replace(/^.*?:where\(/, "").split(/,/).map((x) => x.trim());
          const parts = last.match(/^[a-z]+|\.[\w-]+/g) ?? [];
          const ok = /font-variant-ligatures:\s*none/.test(body) || parts.some((p) => covered.has(p)) || tags.every((t) => covered.has(t));
          if (!ok) bad.push(`${name}: ${selector}`);
        }
      }
    }
    expect(bad, "a literal needs ligatures off: add its element to the rule in wr-reader.css or use .wr-literal").toEqual([]);
  });

  it(".wr-source turns ligatures off itself", () => {
    expect(prose).toMatch(/\.wr-source\s*\{[^}]*font-variant-ligatures:\s*none/);
  });

  it("every font-mono class site or var(--font-mono) use in a component has ligatures off in the same class string or carries .wr-literal", () => {
    const bad: string[] = [];
    const stripJsComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const site = /(?<![\w-])font-mono(?![\w-])|font-\[family-name:var\(--font-mono\)\]|var\(--font-mono\)/g;
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.(?:test|itest)\.tsx?$/.test(e.name) && !p.includes("/components/ui/") && !p.includes("/components/layout/")) {
          const text = stripJsComments(read(p));
          for (const m of text.matchAll(site)) {
            // The string literal that holds this site: from the nearest quote before it to the nearest after it.
            const before = Math.max(text.lastIndexOf('"', m.index), text.lastIndexOf("'", m.index), text.lastIndexOf("`", m.index));
            const after = [text.indexOf('"', m.index), text.indexOf("'", m.index), text.indexOf("`", m.index)].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? text.length;
            const literal = text.slice(before + 1, after);
            if (!/(?<![\w-])wr-literal(?![\w-])|font-variant-ligatures/.test(literal)) bad.push(`${p.slice(SRC.length + 1)}: ${literal.trim().slice(0, 80)}`);
          }
        }
      }
    };
    walk(SRC);
    expect(bad).toEqual([]);
  });
});

describe("the page meta line, the rail and All properties (US-220)", () => {
  /** The body of the file's one `@media print` block. */
  const printBlock = (): string => {
    const start = reader.indexOf("@media print");
    expect(start, "wr-reader.css has a print block").toBeGreaterThan(-1);
    expect(reader.indexOf("@media print", start + 1), "one @media print block per file").toBe(-1);
    return reader.slice(start);
  };
  const ruleBody = (css: string, selector: string): string => rules(css).find(([sel]) => sel.join() === selector)?.[1] ?? "";

  it("the meta line is a wrapping flex row that closes the h1's bottom margin by half", () => {
    const body = ruleBody(reader, ".wr-meta");
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    expect(body).toMatch(/margin:\s*calc\(var\(--space-12\) - var\(--space-24\)\) 0 var\(--space-24\)/);
  });

  it("the rail is sticky below the topbar from 1200px, aligned to the start of its stretched grid area, and scrolls inside itself", () => {
    expect(reader).toMatch(/@media \(min-width: 1200px\)\s*\{\s*\.wr-rail\s*\{[^}]*position:\s*sticky;[^}]*top:\s*calc\(var\(--topbar-h\) \+ var\(--space-24\)\);[^}]*align-self:\s*start;[^}]*overflow:\s*auto/);
  });

  it("All properties is drawn from the summary, with the count at the right and the chevron turning when open", () => {
    expect(ruleBody(reader, ".wr-properties > summary")).toMatch(/display:\s*flex/);
    expect(ruleBody(reader, ".wr-properties__count")).toMatch(/margin-left:\s*auto/);
    expect(ruleBody(reader, ".wr-properties[open] > summary::before")).toMatch(/rotate\(90deg\)/);
  });

  it("print opens the closed disclosure through ::details-content (BUG-040's mechanism), with no script, and puts the rail in the flow", () => {
    const print = printBlock();
    expect(ruleBody(print, ".wr-properties::details-content")).toMatch(/content-visibility:\s*visible/);
    expect(ruleBody(print, ".wr-properties > :not(summary)")).toMatch(/display:\s*block/);
    expect(ruleBody(print, ".wr-rail")).toMatch(/position:\s*static/);
    expect(ruleBody(print, ".wr-properties > summary::before")).toMatch(/display:\s*none/);
  });

  it("the disclosure is never server-rendered open, and no beforeprint handler exists unless the print check proved the CSS fails", () => {
    const source = stripComments(read(join(SRC, "components", "reader", "all-properties.tsx")).replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(source).not.toMatch(/\bopen\b\s*[={]/);
    expect(source).not.toMatch(/beforeprint/i);
  });
});

describe("On this page and heading anchors (US-219)", () => {
  const ruleBody = (css: string, selector: string): string => rules(css).find(([sel]) => sel.join() === selector)?.[1] ?? "";

  it("shows exactly one list copy per width: the rail copy from 1200px, the folded copy below", () => {
    expect(ruleBody(reader, ".wr-layout .wr-toc--rail")).toMatch(/display:\s*none/);
    expect(reader).toMatch(/@media \(min-width: 1200px\)\s*\{\s*\.wr-layout \.wr-toc--rail\s*\{\s*display:\s*block;\s*\}\s*\.wr-layout \.wr-toc--inline\s*\{\s*display:\s*none;/);
  });

  it("an aside holding only the list is hidden below 1200px, so no empty landmark is left", () => {
    expect(reader).toMatch(/@media \(max-width: 1199\.98px\)\s*\{\s*\.wr-rail:not\(:has\(\.wr-properties\)\)\s*\{\s*display:\s*none;/);
  });

  it("the current entry has the selection wash and bold as well as aria-current, so colour is not alone", () => {
    const body = ruleBody(reader, '.wr-layout .wr-toc a[aria-current="location"]');
    expect(body).toMatch(/background:\s*var\(--surface-selected\)/);
    expect(body).toMatch(/font-weight:\s*700/);
  });

  it("the list rules out-rank the article's .wr-prose rules the folded copy sits under", () => {
    const screen = reader.slice(0, reader.indexOf("@media print"));
    for (const [selectors] of rules(screen).filter(([sel]) => sel.some((s) => s.includes(".wr-toc")))) {
      for (const s of selectors) expect(s, s).toMatch(/^\.wr-layout /);
    }
  });

  it("the anchor styles out-rank .wr-prose a (underline, link colour, focus) and the icon is a mask file, not an inline SVG", () => {
    const base = ruleBody(reader, ".wr-prose a.heading-anchor");
    expect(base).toMatch(/text-decoration:\s*none/);
    expect(base).toMatch(/opacity:\s*0/);
    expect(ruleBody(reader, ".wr-prose a.heading-anchor::before")).toMatch(/mask:\s*var\(--wr-icon-hash\)/);
    expect(reader).not.toMatch(/data:|<svg/i);
  });

  it("the anchor shows on heading hover, keyboard focus and any state, and always without hover", () => {
    const shown = rules(reader).find(([sel]) => sel.includes(".wr-prose a.heading-anchor[data-state]"));
    expect(shown?.[0]).toContain(".wr-prose a.heading-anchor:focus-visible");
    expect(shown?.[0].some((x) => x.includes("h3):hover > a.heading-anchor"))).toBe(true);
    expect(shown?.[1]).toMatch(/opacity:\s*1/);
    expect(reader).toMatch(/@media \(hover: none\)\s*\{\s*\.wr-prose a\.heading-anchor\s*\{\s*opacity:\s*1;/);
  });

  it("the copied and failed cues change the icon shape, to a tick and to the danger icon", () => {
    expect(ruleBody(reader, '.wr-prose a.heading-anchor[data-state="copied"]::before')).toMatch(/var\(--wr-icon-tick\)/);
    expect(ruleBody(reader, '.wr-prose a.heading-anchor[data-state="failed"]::before')).toMatch(/var\(--wr-icon-callout-danger\)/);
    expect(ruleBody(reader, '.wr-prose a.heading-anchor[data-state="copied"]')).toMatch(/color:\s*var\(--success\)/);
    expect(ruleBody(reader, '.wr-prose a.heading-anchor[data-state="failed"]')).toMatch(/color:\s*var\(--danger\)/);
  });

  it("neither the list nor the anchors print, and an aside holding only the list does not print", () => {
    const start = reader.indexOf("@media print");
    const print = reader.slice(start);
    const hidden = rules(print).find(([sel]) => sel.includes(".wr-toc"));
    expect(hidden?.[0]).toEqual([".wr-toc", ".wr-prose a.heading-anchor", ".wr-rail:not(:has(.wr-properties))"]);
    expect(hidden?.[1]).toMatch(/display:\s*none/);
  });
});
