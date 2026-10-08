import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-192 (NFR-013, FR-027; TC-504, TC-487 diagram leg): the `--diagram-*` colour pairs, read out of `wr-prose.css` and resolved
 * against the token values in the installed `esg-theme.css` in both themes. The operator's bar ("Text and lines at 3:1"): text 4.5:1 against the
 * fill it sits on, every line or outline that carries meaning 3:1 against what it sits on. The pairs name where Mermaid puts each
 * alias (node, cluster, label, gantt bar and band, pie slice, sequence disc), so a token re-pointed in the alias block fails here
 * with its pair named. The drawn SVGs themselves are measured by the e2e walk (the computed colours of the real Mermaid output).
 * No token is changed to pass.
 */

const read = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
// The installed registry theme (US-216, ADR-020), no longer a hand copy in globals.css.
const globals = read("./esg-theme.css");
const proseRaw = read("./wr-prose.css");
const prose = proseRaw.replace(/\/\*[\s\S]*?\*\//g, "");

function blockAfter(source: string, opener: string): string {
  const at = source.indexOf(opener);
  if (at < 0) throw new Error(`no block opened by ${opener}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`block opened by ${opener} is not closed`);
}

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(value);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  throw new Error(`unsupported colour syntax: ${value}`);
}

function resolve(theme: Map<string, string>, name: string, seen: string[] = []): Rgba {
  const raw = theme.get(`--${name}`);
  if (raw === undefined) throw new Error(`--${name} is not defined`);
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw);
  if (!ref) return parseColour(raw);
  if (seen.includes(name)) throw new Error(`--${name} is a cycle`);
  return resolve(theme, ref[1]!, [...seen, name]);
}

const over = (top: Rgba, under: Rgb): Rgb => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])) as Rgb;
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb): number => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = new Map([...declarations(blockAfter(globals, "\n:root {")), ...declarations(blockAfter(prose, ":root {"))]);
const dark = declarations(blockAfter(globals, '\n@media not print {\n    :root[data-theme="dark"] {'));
const THEMES: Array<[string, Map<string, string>]> = [
  ["light", light],
  ["dark", new Map([...light, ...dark])],
];

/** `diagram-x` -> the colour of that alias in a theme, composited over the page when it carries alpha. */
function colourOf(tokens: Map<string, string>, name: string, ground: Rgb): Rgb {
  return over(resolve(tokens, name), ground);
}

const TEXT_ON = [
  // [text alias, ground alias, where it is]
  ["diagram-ink", "background", "every label on the frame"],
  ["diagram-ink", "diagram-label-surface", "an edge label"],
  ["diagram-ink", "diagram-node", "a node, an actor box, an active gantt bar"],
  ["diagram-ink", "diagram-group", "a cluster, a note, a done gantt bar, an even ER row"],
  ["diagram-ink", "diagram-task", "a gantt bar"],
  ["diagram-ink", "diagram-crit", "a critical gantt bar"],
  ["diagram-ink", "diagram-series-1", "a pie slice percentage (1)"],
  ["diagram-ink", "diagram-series-2", "a pie slice percentage (2)"],
  ["diagram-ink", "diagram-series-3", "a pie slice percentage (3)"],
  ["diagram-ink", "diagram-series-4", "a pie slice percentage (4)"],
  ["diagram-ink", "diagram-series-5", "a pie slice percentage (5)"],
  ["diagram-on-line", "diagram-line", "a sequence number on its disc"],
] as const;

/** [line alias, ground alias, where it is] each at 3:1. */
const LINE_ON = [
  ["diagram-node-border", "background", "a node outline on the frame"],
  ["diagram-node-border", "diagram-group", "a node outline inside a cluster"],
  ["diagram-node-border", "diagram-label-surface", "an actor outline"],
  ["diagram-line", "background", "an edge, a lifeline, a message, a transition, a relation"],
  ["diagram-line", "diagram-group", "an edge inside a cluster, a done bar outline on a band"],
  ["diagram-line", "diagram-label-surface", "an arrowhead beside an edge label"],
  ["diagram-group-border", "background", "a cluster or note outline on the frame"],
  ["diagram-group-border", "diagram-group", "a divider inside a class or ER box"],
  ["diagram-grid", "background", "a gantt grid line on the frame"],
  ["diagram-grid", "diagram-group", "a gantt grid line over a band"],
  ["diagram-task-border", "background", "a gantt bar outline on the frame"],
  ["diagram-task-border", "diagram-group", "a gantt bar outline over a band"],
  ["diagram-crit-border", "background", "a critical bar outline and the today line on the frame"],
  ["diagram-crit-border", "diagram-group", "a critical bar outline and the today line over a band"],
  ["diagram-ink", "diagram-series-1", "a pie outline against slice 1"],
  ["diagram-ink", "diagram-series-2", "a pie outline against slice 2"],
  ["diagram-ink", "diagram-series-3", "a pie outline against slice 3"],
  ["diagram-ink", "diagram-series-4", "a pie outline against slice 4"],
  ["diagram-ink", "diagram-series-5", "a pie outline against slice 5"],
  ["diagram-ink", "background", "a pie outline and a legend swatch outline on the frame"],
] as const;

describe("diagram colour pairs (TC-504, TC-487 diagram leg)", () => {
  it("defines every alias as a var() of an existing token, never a literal", () => {
    const aliases = [...declarations(blockAfter(prose, ":root {"))].filter(([name]) => name.startsWith("--diagram-"));
    expect(aliases.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "--diagram-node", "--diagram-node-border", "--diagram-ink", "--diagram-line", "--diagram-label-surface", "--diagram-group",
        "--diagram-group-border", "--diagram-on-line", "--diagram-grid", "--diagram-task", "--diagram-task-border", "--diagram-crit",
        "--diagram-crit-border", "--diagram-series-1", "--diagram-series-2", "--diagram-series-3", "--diagram-series-4", "--diagram-series-5",
      ]),
    );
    for (const [name, value] of aliases) expect(value, name).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  it("US-216: the first pie slice is the design system's chart-fill-1, and diagram ink on it holds 4.5:1 in both themes", () => {
    // Was accent-border, which tokens v14 moved to a darker violet for the callout border; chart-fill-1 is the slice's own token.
    expect(declarations(blockAfter(prose, ":root {")).get("--diagram-series-1")).toBe("var(--chart-fill-1)");
    for (const [theme, tokens] of THEMES) {
      const page = over(resolve(tokens, "background"), [255, 255, 255]);
      const bg = colourOf(tokens, "chart-fill-1", page);
      const ink = over(resolve(tokens, "diagram-ink"), bg);
      expect(ratio(ink, bg), `${theme}: diagram-ink on chart-fill-1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every --diagram-* a rule reads is defined", () => {
    const defined = new Set([...declarations(blockAfter(prose, ":root {")).keys()]);
    for (const m of prose.matchAll(/var\((--diagram-[a-z0-9-]+)\)/g)) expect(defined.has(m[1]!), m[1]).toBe(true);
  });

  for (const [theme, tokens] of THEMES) {
    for (const [text, ground, where] of TEXT_ON) {
      it(`${theme}: ${text} on ${ground} (${where}) is 4.5:1 or better`, () => {
        const page = over(resolve(tokens, "background"), [255, 255, 255]);
        const bg = colourOf(tokens, ground, page);
        const fg = over(resolve(tokens, text), bg);
        expect(ratio(fg, bg), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [line, ground, where] of LINE_ON) {
      it(`${theme}: ${line} on ${ground} (${where}) is 3:1 or better`, () => {
        const page = over(resolve(tokens, "background"), [255, 255, 255]);
        const bg = colourOf(tokens, ground, page);
        const fg = over(resolve(tokens, line), bg);
        expect(ratio(fg, bg), `${line} on ${ground}`).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("the Mermaid override section (override strategy)", () => {
  const start = prose.indexOf("[data-mermaid-id] svg:not(#_)");
  const section = prose.slice(start, prose.indexOf(".wr-prose details {"));
  const rules = [...section.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));

  it("found the override rules", () => {
    expect(rules.length).toBeGreaterThan(30);
  });

  it("every colour declaration is !important and every selector carries the id-weight :not(#_) on the svg", () => {
    for (const { selector, body } of rules) {
      expect(selector, selector).toContain("svg:not(#_)");
      for (const d of body.split(";").map((x) => x.trim()).filter(Boolean)) {
        if (/^(fill|stroke|color|background-color)\s*:/.test(d)) expect(d, `${selector} { ${d} }`).toMatch(/!important$/);
      }
    }
  });

  it("takes every colour from a --diagram-* alias: no raw colour, no other token", () => {
    for (const { selector, body } of rules) {
      for (const d of body.split(";").map((x) => x.trim()).filter(Boolean)) {
        const m = /^(fill|stroke|color|background-color)\s*:\s*(.+?)\s*!important$/.exec(d);
        if (!m) continue;
        expect(m[2], `${selector} { ${d} }`).toMatch(/^(var\(--diagram-[a-z0-9-]+\)|none)$/);
      }
    }
  });

  it("never sets Mermaid's own theme: the stylesheet is the only theming, so a theme switch redraws nothing", () => {
    expect(proseRaw).not.toMatch(/themeVariables|mermaid\.initialize/);
  });
});
