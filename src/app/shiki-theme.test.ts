import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HIGHLIGHT_THEME } from "@/content/render/highlighter";
import { SHIKI_SPAN_STYLE } from "@/content/render/sanitize-schema";

/**
 * US-190 (FR-025, FR-048, NFR-013; contract rows 2 and 5): the `--shiki-*` variables Shiki's css-variables theme can emit
 * are all defined in `wr-prose.css` from the ESG tokens, each emitted colour is one the sanitiser admits, and every token
 * colour reads at 4.5:1 or better on the code ground in both themes (code-function at 5.89 and 7.65). Values are read
 * from the two stylesheets and resolved through their `var()` chains, so a token edit that breaks a pair names it.
 */

const read = (name: string): string => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
// The installed registry theme (US-216, ADR-020), no longer a hand copy in globals.css.
const globals = read("./esg-theme.css");
const wrProse = read("./wr-prose.css").replace(/\/\*[\s\S]*?\*\//g, "");

function blockAfter(css: string, opener: string): string {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`no block opened by ${opener}`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`block opened by ${opener} is not closed`);
}
function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = declarations(blockAfter(globals, "\n:root {"));
const dark = declarations(blockAfter(globals, '\n@media not print {\n    :root[data-theme="dark"] {'));
const darkSystem = declarations(blockAfter(globals, "\n@media screen and (prefers-color-scheme: dark) {\n    :root:not([data-theme]) {"));
// The rule that holds the variables is the `.wr-prose` one whose body names --shiki-foreground (not the first `.wr-prose {`).
const shikiRule = /(?:^|\n)\.wr-prose\s*\{([^}]*--shiki-foreground[^}]*)\}/.exec(wrProse)?.[1];
if (shikiRule === undefined) throw new Error("wr-prose.css has no `.wr-prose { --shiki-foreground: ... }` rule");
const shiki = declarations(shikiRule);
const shikiNames = [...shiki.keys()].filter((n) => n.startsWith("--shiki-"));

type Rgb = [number, number, number];
function parseHex(value: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m) throw new Error(`not an opaque hex colour: ${value}`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Follows `var(--x)` chains through one theme's declarations (the theme overlay on top of `:root`). */
function resolve(theme: Map<string, string>, name: string, seen: string[] = []): Rgb {
  const raw = theme.get(name) ?? shiki.get(name);
  if (raw === undefined) throw new Error(`${name} is not defined`);
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (!ref) return parseHex(raw);
  if (seen.includes(name)) throw new Error(`${name} is a cycle`);
  return resolve(theme, ref[1]!, [...seen, name]);
}
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb): number => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (c: Rgb): string => `#${c.map((n) => n.toString(16).padStart(2, "0")).join("")}`;

const THEMES: Array<[string, Map<string, string>]> = [
  ["light", light],
  ["dark", new Map([...light, ...dark])],
  ["dark (system)", new Map([...light, ...darkSystem])],
];

/** Every `--shiki-*` variable the theme's own rules can write, read from the theme object (the foreground and the token rules; the background and the ANSI colours are not emitted on a span), not a hand list. */
const emitted = [...new Set([...JSON.stringify([HIGHLIGHT_THEME.colors?.["editor.foreground"], HIGHLIGHT_THEME.tokenColors]).matchAll(/var\((--shiki-[a-z-]+)\)/g)].map((m) => m[1]!))].sort();

describe("the css-variables theme and the content stylesheet agree (ADR-010 amendment 2026-10-05)", () => {
  it("the theme is the css-variables theme with the foreground and the twelve token variables", () => {
    expect(HIGHLIGHT_THEME.name).toBe("css-variables");
    expect(emitted).toEqual([
      "--shiki-foreground",
      "--shiki-token-changed",
      "--shiki-token-comment",
      "--shiki-token-constant",
      "--shiki-token-deleted",
      "--shiki-token-function",
      "--shiki-token-inserted",
      "--shiki-token-keyword",
      "--shiki-token-link",
      "--shiki-token-parameter",
      "--shiki-token-punctuation",
      "--shiki-token-string",
      "--shiki-token-string-expression",
    ]);
  });

  it("carries no font style, so a span style is colour only", () => {
    const fontStyles = (HIGHLIGHT_THEME.tokenColors ?? []).filter((r) => r.settings && "fontStyle" in r.settings && r.settings.fontStyle);
    expect(fontStyles).toEqual([]);
  });

  it("every emitted colour is one the sanitiser admits", () => {
    for (const v of emitted) expect(`color:var(${v})`, v).toMatch(SHIKI_SPAN_STYLE);
  });

  it("wr-prose.css defines every variable the theme can emit, and nothing else", () => {
    expect(emitted).toHaveLength(13);
    expect([...shikiNames].sort()).toEqual(emitted);
  });

  it("defines them as references to tokens (no colour literal of its own), so both themes follow the token sets", () => {
    for (const [name, value] of shiki) if (name.startsWith("--shiki-")) expect(value, name).toMatch(/^var\(--[a-z-]+\)$/);
  });
});

describe("token contrast on the code ground (US-190, TC-499 pairs)", () => {
  for (const [themeName, theme] of THEMES) {
    it(`every --shiki-* colour is at least 4.5:1 on the code ground in the ${themeName} theme, and on the page ground (a fence in a callout)`, () => {
      expect(shikiNames, "non-vacuous: the variables were found").toHaveLength(13);
      const failing = ["--code-surface", "--background"].flatMap((ground) =>
        shikiNames.flatMap((name) => {
          const r = ratio(resolve(theme, name), resolve(theme, ground));
          return r < 4.5 ? [`${themeName}: ${name} ${hex(resolve(theme, name))} on ${ground} ${hex(resolve(theme, ground))} = ${r.toFixed(2)}:1`] : [];
        }),
      );
      expect(failing).toEqual([]);
    });
  }

  it("keeps the operator's mapping from existing tokens, per theme", () => {
    for (const [, theme] of THEMES) {
      const same = (a: string, b: string) => expect(resolve(theme, a), `${a} = ${b}`).toEqual(resolve(theme, b));
      same("--shiki-foreground", "--foreground");
      same("--shiki-token-keyword", "--primary-text");
      same("--shiki-token-function", "--code-function");
      same("--shiki-token-string", "--success");
      same("--shiki-token-string-expression", "--success");
      same("--shiki-token-inserted", "--success");
      same("--shiki-token-constant", "--warning");
      same("--shiki-token-changed", "--warning");
      same("--shiki-token-comment", "--ink-muted");
      same("--shiki-token-punctuation", "--muted-foreground");
      same("--shiki-token-parameter", "--foreground");
      same("--shiki-token-link", "--primary-text");
      same("--shiki-token-deleted", "--danger");
      same("--code-surface", "--muted");
    }
  });

  it("measures code-function at 5.89 in light and 7.65 in dark", () => {
    const onGround = (theme: Map<string, string>) => ratio(resolve(theme, "--shiki-token-function"), resolve(theme, "--code-surface"));
    expect(onGround(light)).toBeCloseTo(5.89, 1);
    expect(onGround(new Map([...light, ...dark]))).toBeCloseTo(7.65, 1);
  });

  it("the two dark copies agree on every token the code colours read", () => {
    for (const name of [...shikiNames, "--code-surface"]) expect(hex(resolve(THEMES[1]![1], name)), name).toBe(hex(resolve(THEMES[2]![1], name)));
  });
});
