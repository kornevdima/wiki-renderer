import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * US-170, TC-499 (NFR-009 as amended by CR-006, NFR-013): reads the ESG token values out of the installed `esg-theme.css`
 * (US-216, ADR-020: the registry's generated theme, no longer a hand copy in `globals.css`) and computes
 * the contrast of every pair the app is built from, in both themes, including states a page scan never reaches (hover
 * and pressed shades, selected, status text on its surface, code tokens on the code ground). A failing pair is reported
 * by name with both values and the ratio. No token is changed to pass: the values come from the design system.
 */

const css = readFileSync(fileURLToPath(new URL("./esg-theme.css", import.meta.url)), "utf8");
const globalsCss = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

/** The declarations of the first block that follows `opener`, balanced on braces. */
function blockAfter(opener: string): string {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`esg-theme.css has no block opened by ${opener}`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`esg-theme.css block opened by ${opener} is not closed`);
}

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const light = declarations(blockAfter("\n:root {"));
// Anchored on the exact at-rule and selector, so a missing or moved block throws instead of reading another one.
const DARK_ATTRIBUTE_AT_RULE = "\n@media not print {";
const DARK_SYSTEM_AT_RULE = "\n@media screen and (prefers-color-scheme: dark) {";
const dark = declarations(blockAfter(`${DARK_ATTRIBUTE_AT_RULE}\n    :root[data-theme="dark"] {`));
const darkSystemOuter = blockAfter(DARK_SYSTEM_AT_RULE);
if (!darkSystemOuter.includes(":root:not([data-theme])")) throw new Error("the system dark at-rule does not hold :root:not([data-theme])");
const darkSystem = declarations(blockAfter(`${DARK_SYSTEM_AT_RULE}\n    :root:not([data-theme]) {`));

// The theme writes the shadcn aliases (`--popover`, `--destructive`, ...) once on `:root`, and each dark block only the values
// that change; so what a theme means is the light set with that theme's own overrides on top.
const lightEffective = light;
const darkEffective = new Map([...light, ...dark]);
const darkSystemEffective = new Map([...light, ...darkSystem]);
const EFFECTIVE = [lightEffective, darkEffective, darkSystemEffective];

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
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
  return resolve(theme, ref[1], [...seen, name]);
}

const over = (top: Rgba, under: Rgb): Rgb => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])) as Rgb;
const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb): number => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (c: readonly number[]): string => `#${c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

/** A ground: a token name, or a token with a shade composited over it (hover and pressed states). */
interface Ground {
  base: string;
  shade?: string;
}
interface Pair {
  name: string;
  fg: string;
  ground: Ground | string;
  bar: 4.5 | 3;
}

const STATUSES = ["success", "warning", "danger", "info"] as const;
const SURFACES = ["background", "muted", "surface-selected", "surface-raised"] as const;

const PAIRS: Pair[] = [
  // Text on the three surfaces.
  ...(["foreground", "muted-foreground", "ink-muted"] as const).flatMap((fg) =>
    SURFACES.map((s): Pair => ({ name: `${fg} on ${s}`, fg, ground: s, bar: 4.5 })),
  ),
  ...SURFACES.filter((s) => s !== "muted").map((s): Pair => ({ name: `primary-text on ${s}`, fg: "primary-text", ground: s, bar: 4.5 })),
  // US-176: the user menu's initials avatar sits on pastel-blue.
  { name: "foreground on pastel-blue", fg: "foreground", ground: "pastel-blue", bar: 4.5 },
  // Filled controls: label on fill, at rest, hovered and pressed.
  ...(["primary", "destructive"] as const).flatMap((fill) => {
    const label = fill === "primary" ? "primary-foreground" : "destructive-foreground";
    return [
      { name: `${label} on ${fill}`, fg: label, ground: fill, bar: 4.5 },
      { name: `${label} on ${fill} + shade-hover`, fg: label, ground: { base: fill, shade: "shade-hover" }, bar: 4.5 },
      { name: `${label} on ${fill} + shade-active`, fg: label, ground: { base: fill, shade: "shade-active" }, bar: 4.5 },
    ] satisfies Pair[];
  }),
  // US-174: the destructive button's own label and fill tokens, at rest, hovered and pressed, and the checkbox tick on its fill.
  { name: "on-danger on danger-fill", fg: "on-danger", ground: "danger-fill", bar: 4.5 },
  { name: "on-danger on danger-fill + shade-hover", fg: "on-danger", ground: { base: "danger-fill", shade: "shade-hover" }, bar: 4.5 },
  { name: "on-danger on danger-fill + shade-active", fg: "on-danger", ground: { base: "danger-fill", shade: "shade-active" }, bar: 4.5 },
  { name: "checkbox-mark on checkbox-fill", fg: "checkbox-mark", ground: "checkbox-fill", bar: 3 },
  { name: "danger on background (invalid border)", fg: "danger", ground: "background", bar: 3 },
  // Status text on each status surface and on the page.
  ...STATUSES.flatMap((s): Pair[] => [
    { name: `${s} on ${s}-surface`, fg: s, ground: `${s}-surface`, bar: 4.5 },
    { name: `${s} on background`, fg: s, ground: "background", bar: 4.5 },
    { name: `foreground on ${s}-surface`, fg: "foreground", ground: `${s}-surface`, bar: 4.5 },
  ]),
  // Code tokens on the code ground.
  ...(["code-ink", "code-keyword", "code-string", "code-constant", "code-comment", "code-punctuation", "code-function", "code-inserted", "code-deleted"] as const).map(
    (t): Pair => ({ name: `${t} on code-surface`, fg: t, ground: "code-surface", bar: 4.5 }),
  ),
  // Non-text: the focus ring, input borders, the selection accent, the checkbox and the switch track.
  { name: "ring on background", fg: "ring", ground: "background", bar: 3 },
  { name: "ring on muted", fg: "ring", ground: "muted", bar: 3 },
  { name: "ring on surface-selected", fg: "ring", ground: "surface-selected", bar: 3 },
  { name: "border-strong on background", fg: "border-strong", ground: "background", bar: 3 },
  { name: "border-strong on muted", fg: "border-strong", ground: "muted", bar: 3 },
  { name: "input on background", fg: "input", ground: "background", bar: 3 },
  { name: "accent-border on background", fg: "accent-border", ground: "background", bar: 3 },
  // US-213 / US-216: the important callout's violet border on its selected-surface ground is held to 4.5:1 (tokens v14, accent-border #8145ea / #a275f0).
  { name: "accent-border on surface-selected", fg: "accent-border", ground: "surface-selected", bar: 4.5 },
  { name: "checkbox-fill on background", fg: "checkbox-fill", ground: "background", bar: 3 },
  { name: "switch-off on background", fg: "switch-off", ground: "background", bar: 3 },
];

// The code aliases are declared once on :root and resolve against the active theme on the same element, so the dark
// theme is the light declarations overridden by the dark ones.
const THEMES: Array<[string, Map<string, string>]> = [
  ["light", light],
  ["dark", new Map([...light, ...dark])],
];

function measure(theme: Map<string, string>, pair: Pair): { ratio: number; fg: string; bg: string } {
  const g = typeof pair.ground === "string" ? { base: pair.ground } : pair.ground;
  const page = over(resolve(theme, "background"), [255, 255, 255]);
  let bg = over(resolve(theme, g.base), page);
  if (g.shade) bg = over(resolve(theme, g.shade), bg);
  const fg = over(resolve(theme, pair.fg), bg);
  return { ratio: ratio(fg, bg), fg: hex(fg), bg: hex(bg) };
}

describe("esg-theme.css token pairs (TC-499)", () => {
  for (const [themeName, theme] of THEMES) {
    it(`every pair meets its bar in the ${themeName} theme`, () => {
      const failing = PAIRS.flatMap((pair) => {
        const m = measure(theme, pair);
        return m.ratio < pair.bar ? [`${themeName}: ${pair.name}: ${m.fg} on ${m.bg} = ${m.ratio.toFixed(2)}:1, needs ${pair.bar}:1`] : [];
      });
      expect(failing).toEqual([]);
    });
  }

  it("keeps the measured accent-border and code-function ratios the design system records", () => {
    const accent = (t: Map<string, string>): number => ratio(over(resolve(t, "accent-border"), [255, 255, 255]), over(resolve(t, "background"), [255, 255, 255]));
    // tokens v14 (US-213, US-216): accent-border is #8145ea / #a275f0; on the page it was 3.65:1 in light at v9.
    const darkResolved = new Map([...light, ...dark]);
    expect(accent(light)).toBeCloseTo(5.29, 2);
    expect(accent(darkResolved)).toBeCloseTo(5.6, 2);
    const onCode = (t: Map<string, string>): number => measure(t, { name: "", fg: "code-function", ground: "code-surface", bar: 4.5 }).ratio;
    expect(onCode(light)).toBeGreaterThan(5.5);
    expect(onCode(darkResolved)).toBeGreaterThan(7);
  });

  it("keeps every pair TC-499 names in the list, so deleting one is a failure", () => {
    const names = new Set(PAIRS.map((p) => p.name));
    const required = [
      "foreground on background",
      "foreground on muted",
      "foreground on surface-selected",
      "muted-foreground on background",
      "muted-foreground on muted",
      "muted-foreground on surface-selected",
      "ink-muted on background",
      "ink-muted on muted",
      "ink-muted on surface-selected",
      "primary-text on background",
      "primary-text on surface-selected",
      "primary-foreground on primary",
      "primary-foreground on primary + shade-hover",
      "primary-foreground on primary + shade-active",
      "destructive-foreground on destructive",
      "destructive-foreground on destructive + shade-hover",
      "destructive-foreground on destructive + shade-active",
      "on-danger on danger-fill",
      "on-danger on danger-fill + shade-hover",
      "on-danger on danger-fill + shade-active",
      "checkbox-mark on checkbox-fill",
      ...STATUSES.map((s) => `${s} on ${s}-surface`),
      ...["code-ink", "code-keyword", "code-string", "code-constant", "code-comment", "code-punctuation", "code-function", "code-inserted", "code-deleted"].map((t) => `${t} on code-surface`),
      "ring on background",
      "ring on muted",
      "border-strong on background",
    ];
    expect(required.filter((n) => !names.has(n))).toEqual([]);
    const bars = new Map(PAIRS.map((p) => [p.name, p.bar]));
    expect(["ring on background", "ring on muted", "border-strong on background"].map((n) => bars.get(n))).toEqual([3, 3, 3]);
  });

  it("measures each pair without reading an undefined variable", () => {
    for (const [, theme] of THEMES) for (const pair of PAIRS) expect(() => measure(theme, pair)).not.toThrow();
  });
});

describe("esg-theme.css theme wiring (US-170)", () => {
  it("writes the system-preference dark block with the same values as the data-theme dark block", () => {
    expect([...darkSystem.entries()].sort()).toEqual([...dark.entries()].sort());
  });

  it("loads each dark copy with the full token set, so an empty or wrong block fails loudly", () => {
    expect(dark.size).toBeGreaterThan(40);
    expect(darkSystem.size).toBe(dark.size);
  });

  it("prints the whole light set: both dark sets sit outside print, and the print block resets no variable by hand", () => {
    const printStart = css.indexOf("\n@media print {");
    expect(printStart).toBeGreaterThan(-1);
    const print = blockAfter("\n@media print {");
    // Neither dark selector exists outside a screen-only at-rule, so in print only the full light `:root` set applies.
    expect(css.indexOf(':root[data-theme="dark"] {')).toBeGreaterThan(css.indexOf(DARK_ATTRIBUTE_AT_RULE));
    expect(css.indexOf(":root:not([data-theme]) {")).toBeGreaterThan(css.indexOf(DARK_SYSTEM_AT_RULE));
    expect(css.split(':root[data-theme="dark"] {')).toHaveLength(2);
    expect(css.split(":root:not([data-theme]) {")).toHaveLength(2);
    expect(print).not.toMatch(/data-theme/);
    expect(print).not.toMatch(/--(background|foreground|ink-muted|muted-foreground|border)\s*:/);
    expect(print).toContain("color-scheme: light");
    // The `dark:` variant is excluded from print as well.
    expect(blockAfter("@custom-variant dark")).toMatch(/@media not print \{[\s\S]*\}\s*@media screen and \(prefers-color-scheme: dark\)/);
  });

  it("carries the story's light and dark values", () => {
    const val = (t: Map<string, string>, n: string): string => hex(resolve(t, n));
    expect(["background", "card", "popover"].map((n) => val(light, n))).toEqual(["#ffffff", "#ffffff", "#ffffff"]);
    expect(val(light, "foreground")).toBe("#131316");
    expect(val(light, "primary")).toBe("#6c47ff");
    expect(val(light, "ring")).toBe("#6c47ff");
    expect(val(light, "muted-foreground")).toBe("#5f606c");
    expect(val(light, "border")).toBe("#dadfe2");
    expect(val(light, "destructive")).toBe("#c2412d");
    // `--radius` moved to the theme's `@theme static` block, aliased onto the design system's own radius token.
    const fixed = declarations(blockAfter("@theme static"));
    expect(fixed.get("--radius")).toBe("var(--ds-radius-md)");
    expect(fixed.get("--ds-radius-md")).toBe("12px");
    expect(val(darkEffective, "background")).toBe("#131316");
    expect(val(darkEffective, "foreground")).toBe("#ffffff");
    expect(val(darkEffective, "ring")).toBe("#9b85ff");
    expect(val(darkEffective, "muted-foreground")).toBe("#c4c5cc");
    expect(val(darkEffective, "border")).toBe("#2c2d33");
    expect(val(darkEffective, "destructive")).toBe("#c2412d");
    expect(val(darkEffective, "destructive-foreground")).toBe("#ffffff");
  });

  it("defines every variable in both themes, so a theme never inherits the other's value", () => {
    // The aliases (`var(...)` values) are written once on `:root` and follow the theme; every value that is a literal in
    // light needs its own dark value.
    const literals = (t: Map<string, string>): string[] => [...t.entries()].filter(([, v]) => !v.startsWith("var(")).map(([k]) => k).sort();
    // Only the theme-invariant gradients and the fills composed from them (which hold no theme colour) are written once.
    // v31 adds the TenantLogo grounds (gradient-mark-*); hover-overlay-fill is composed from a theme variable like the others.
    const invariant = /^--(gradient-(brand|hero|spectrum|mark-(indigo|deep|glow))|(brand|shade)-(hover|active)-fill|hover-overlay-fill)$/;
    const missingInDark = literals(light).filter((k) => !dark.has(k));
    expect(missingInDark.filter((k) => !invariant.test(k))).toEqual([]);
    expect(literals(dark).filter((k) => !light.has(k))).toEqual([]);
  });

  it("has no stale default theme: no oklch value, no chart or sidebar variable, no .dark block, no half-opacity ring", () => {
    expect(css).not.toMatch(/oklch\(/);
    // `--sidebar-w` is the design system's own layout token (the app shell's sidebar width, US-176), not shadcn's sidebar colours.
    // The design system's own `--chart-series-N` / `--chart-fill-N` (tokens v14) are not shadcn's `--chart-N`.
    expect(css).not.toMatch(/--(chart-\d|sidebar(?!-w(?:-collapsed)?:))/);
    expect(css).not.toMatch(/\.dark\b/);
    expect(css).not.toMatch(/outline-ring\/50/);
  });

  it("draws the focus ring as a solid 2px outline in the ring colour at full opacity", () => {
    // BUG-028: colour, width and offset are constant at base; focus only turns the style on, so nothing can animate.
    const base = blockAfter(":where(*, ::before, ::after)");
    expect(base).toMatch(/outline-color:\s*var\(--ring\)/);
    expect(base).toMatch(/outline-width:\s*var\(--focus-ring-width\)/);
    expect(base).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
    expect(css).toMatch(/--focus-ring-width:\s*2px/);
    expect(css).toMatch(/--focus-ring-offset:\s*2px/);
    expect(blockAfter(':focus-visible:where(:not([tabindex="-1"]))')).toMatch(/outline-style:\s*solid/);
  });

  it("US-212: the page scrolls a focused control with its whole outline on screen, and clears the sticky top bar", () => {
    const html = blockAfter("  html {")
    expect(html).toMatch(/scroll-padding-top:\s*calc\(var\(--topbar-h\) \+ var\(--focus-ring-width\) \+ var\(--focus-ring-offset\) \+ var\(--space-8\)\)/)
    expect(html).toMatch(/scroll-padding-bottom:\s*calc\(var\(--focus-ring-width\) \+ var\(--focus-ring-offset\) \+ var\(--space-8\)\)/)
  });

  it("BUG-028: the focus-visible rule declares only outline-style: solid (any colour, width or offset there would animate in from currentColor)", () => {
    const focus = blockAfter(':focus-visible:where(:not([tabindex="-1"]))');
    const declarations = focus.replace(/\/\*[\s\S]*?\*\//g, "").split(";").map((d) => d.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(declarations).toEqual(["outline-style: solid"]);
  });
});

describe("esg-theme.css control tokens (US-174)", () => {
  it("writes danger-fill, on-danger and hover-overlay in the light block and in both dark blocks, from tokens.json", () => {
    for (const [name, block] of [["light", light], ["dark", dark], ["dark system", darkSystem]] as const) {
      expect(block.get("--danger-fill"), `${name} danger-fill`).toBe("#c2412d");
      expect(block.get("--on-danger"), `${name} on-danger`).toBe("#ffffff");
    }
    expect(light.get("--hover-overlay")).toBe("rgba(19, 19, 22, 0.04)");
    expect(dark.get("--hover-overlay")).toBe("rgba(255, 255, 255, 0.06)");
  });

  it("maps --destructive onto the danger-fill and --destructive-foreground onto on-danger", () => {
    for (const block of EFFECTIVE) {
      expect(block.get("--destructive")).toBe("var(--danger-fill)");
      expect(block.get("--destructive-foreground")).toBe("var(--on-danger)");
    }
  });

  it("declares the control tokens with tokens.json values (the colour-literal ones in all three blocks)", () => {
    const decl = declarations(blockAfter("@theme static"));
    expect(decl.get("--opacity-disabled")).toBe("0.45");
    expect(decl.get("--duration-button")).toBe("250ms");
    expect(decl.get("--ease-standard")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect([decl.get("--control-h-l"), decl.get("--control-h-m"), decl.get("--control-h-s")]).toEqual(["56px", "40px", "48px"]);
    for (const block of EFFECTIVE) {
      expect(block.get("--shadow-button")).toBe("0px 3px 1px -2px rgba(0, 0, 0, 0.2), 0px 2px 2px 0px rgba(0, 0, 0, 0.14), 0px 1px 5px 0px rgba(0, 0, 0, 0.12)");
      expect(block.get("--shadow-button-hover")).toBe("0px 2px 4px -1px rgba(0, 0, 0, 0.2), 0px 4px 5px 0px rgba(0, 0, 0, 0.14), 0px 1px 10px 0px rgba(0, 0, 0, 0.12)");
      expect(block.get("--shadow-button-active")).toBe("0px 5px 5px -3px rgba(0, 0, 0, 0.2), 0px 8px 10px 1px rgba(0, 0, 0, 0.14), 0px 3px 14px 2px rgba(0, 0, 0, 0.12)");
      expect(block.get("--gradient-brand")).toBe("linear-gradient(30deg, #e08f42 0%, #a0738d 22%, #836dab 43%, #7368ca 63%, #595ce3 81%, #3537bb 99%)");
    }
  });

  it("styles the native select and checkbox in the base layer with no transition on an outline property", () => {
    const base = blockAfter("@layer base");
    expect(base).toMatch(/input\[type="checkbox"\]:checked\s*\{[^}]*background-color: var\(--checkbox-fill\)/);
    expect(base).toMatch(/input\[type="checkbox"\]:checked::after\s*\{[^}]*var\(--checkbox-mark\)/);
    expect(base).toMatch(/select:not\(\[multiple\]\):not\(\[size\]\)\s*\{[^}]*appearance: none/);
    for (const t of base.matchAll(/transition:\s*([^;]+);/g)) expect(t[1]).not.toMatch(/outline|\ball\b/);
  });
});

describe("US-174: app-control rules stay out of rendered content", () => {
  it("the installed theme's native checkbox rules reach the reader, so wr-prose.css undoes the two that would show (US-216)", () => {
    // esg-theme.css has no `.wr-prose` exclusion (registry-first: it is not edited here). Of its checkbox rules, the disabled
    // dimming and the checked ::after tick would change a read-only task-list box, so the reader's own sheet overrides them.
    const theme = blockAfter("@layer base");
    expect(theme).toMatch(/input\[type="checkbox"\]:disabled\s*\{[^}]*opacity:/);
    expect(theme).toMatch(/input\[type="checkbox"\]:checked::after\s*\{[^}]*content:/);
    const prose = readFileSync(fileURLToPath(new URL("./wr-prose.css", import.meta.url)), "utf8");
    expect(prose).toMatch(/\.wr-prose \.task-list-item > input\[type="checkbox"\]:disabled\s*\{\s*opacity:\s*1;/);
    expect(prose).toMatch(/\.wr-prose \.task-list-item > input\[type="checkbox"\]:checked::after\s*\{\s*content:\s*none;/);
  });
});

describe("globals.css holds only the app's own rules (US-216, ADR-020)", () => {
  it("imports the theme and holds no custom-property declaration", () => {
    expect(globalsCss).toMatch(/@import "tailwindcss";\s*@import "tw-animate-css";\s*@import "\.\/esg-theme\.css";\s*@import "\.\/wr-prose\.css";\s*@import "\.\/wr-reader\.css";/);
    expect(globalsCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/--[a-z0-9-]+\s*:/);
  });
});

describe("esg-theme.css floating-panel tokens (US-175)", () => {
  it("writes surface-raised and shadow-raised in the light block and in both dark blocks, from tokens.json", () => {
    const shadow = "0px 4px 20px 0px rgba(0, 0, 0, 0.15)";
    expect(light.get("--surface-raised")).toBe("#ffffff");
    for (const [name, block] of [["dark", dark], ["dark system", darkSystem]] as const) expect(block.get("--surface-raised"), `${name} surface-raised`).toBe("#1f1f25");
    for (const [name, block] of [["light", light], ["dark", dark], ["dark system", darkSystem]] as const) expect(block.get("--shadow-raised"), `${name} shadow-raised`).toBe(shadow);
  });

  it("maps shadcn popover onto surface-raised in all three blocks (operator option 0, 2026-10-03)", () => {
    for (const block of EFFECTIVE) expect(block.get("--popover")).toBe("var(--surface-raised)");
  });

  it("keeps the text and status pairs on the raised surface in the list, so a floating panel's text is held to its bar", () => {
    const names = new Set(PAIRS.map((p) => p.name));
    expect(["foreground on surface-raised", "muted-foreground on surface-raised", "ink-muted on surface-raised", "primary-text on surface-raised"].filter((n) => !names.has(n))).toEqual([]);
  });

  it("declares the modal and table sizes from tokens.json", () => {
    const decl = declarations(blockAfter("@theme static"));
    expect([decl.get("--modal-w"), decl.get("--modal-w-l"), decl.get("--row-h"), decl.get("--row-h-compact"), decl.get("--icon-feature")]).toEqual(["560px", "800px", "52px", "40px", "56px"]);
    expect([decl.get("--ds-radius-md"), decl.get("--ds-radius-lg")]).toEqual(["12px", "20px"]);
  });
});
