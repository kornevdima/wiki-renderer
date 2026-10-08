import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-191 (NFR-013, NFR-009; TC-487 callout leg): the callout colour pairs, read out of `wr-prose.css` and resolved against the
 * token values in the installed `esg-theme.css` in both themes. Title and body text (`--foreground`) must have 4.5:1 on every callout surface,
 * and the icon (`--callout-ink`) 3:1. The pairs come from the callout rules themselves, so a type added or re-coloured there is
 * measured without editing this file. No token is changed to pass.
 */

const read = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
// The installed registry theme (US-216, ADR-020), no longer a hand copy in globals.css.
const globals = read("./esg-theme.css");
const prose = read("./wr-prose.css").replace(/\/\*[\s\S]*?\*\//g, "");

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

/** The callout kinds: the default from `.callout`, then each `.callout-<type>` rule, with the three tokens it sets. */
const KINDS = new Map<string, { ink: string; surface: string }>();
{
  const tokenOf = (decls: Map<string, string>, prop: string): string => {
    const m = /^var\(--([a-z0-9-]+)\)$/.exec(decls.get(prop) ?? "");
    if (!m) throw new Error(`${prop} is not a var() reference`);
    return m[1]!;
  };
  const base = declarations(blockAfter(prose, ".wr-prose .callout {"));
  KINDS.set("default", { ink: tokenOf(base, "--callout-ink"), surface: tokenOf(base, "--callout-surface") });
  for (const m of prose.matchAll(/\.wr-prose \.callout-([a-z]+)\s*\{/g)) {
    if (m[1] === "title" || m[1] === "icon") continue;
    const d = declarations(blockAfter(prose.slice(m.index), m[0]));
    KINDS.set(m[1]!, { ink: tokenOf(d, "--callout-ink"), surface: tokenOf(d, "--callout-surface") });
  }
}

describe("callout colour pairs (TC-487 callout leg)", () => {
  it("covers the seven pipeline types and the default", () => {
    expect([...KINDS.keys()].sort()).toEqual(["danger", "default", "important", "info", "note", "success", "tip", "warning"]);
  });

  it("defines --accent-surface as an alias of an existing token, not a literal", () => {
    expect(declarations(blockAfter(prose, ":root {")).get("--accent-surface")).toBe("var(--surface-selected)");
  });

  it("US-216: the important callout's border stays on accent-border, which holds 4.5:1 on its surface in both themes", () => {
    const important = declarations(blockAfter(prose, ".wr-prose .callout-important {"));
    expect(important.get("--callout-border")).toBe("var(--accent-border)");
    for (const [theme, tokens] of THEMES) {
      const page = over(resolve(tokens, "background"), [255, 255, 255]);
      const ground = over(resolve(tokens, "surface-selected"), page);
      expect(ratio(over(resolve(tokens, "accent-border"), ground), ground), `${theme}: accent-border on surface-selected`).toBeGreaterThanOrEqual(4.5);
    }
  });

  for (const [theme, tokens] of THEMES) {
    for (const [kind, { ink, surface }] of KINDS) {
      it(`${theme}, ${kind}: title and body text 4.5:1 and the icon 3:1 on the surface`, () => {
        const page = over(resolve(tokens, "background"), [255, 255, 255]);
        const ground = over(resolve(tokens, surface), page);
        const text = ratio(over(resolve(tokens, "foreground"), ground), ground);
        const icon = ratio(over(resolve(tokens, ink), ground), ground);
        expect(text, `--foreground on --${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(icon, `--${ink} on --${surface}`).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
