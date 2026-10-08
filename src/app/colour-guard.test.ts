import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/**
 * US-173, TC-498 (NFR-013): no colour is written by hand outside the token layer. Two halves:
 *  1. the palette reset in the installed `esg-theme.css` (`--color-*: initial`, imported by `globals.css`) makes a default-palette utility generate no CSS, so a
 *     `bg-red-500` paints nothing instead of an off-brand red (contract row 1);
 *  2. a source scan fails on a colour literal or palette class in `web/src`, naming `file:line` (rows 2-4).
 * The token layer is the custom-property declarations in the installed `esg-theme.css` (the registry's generated theme,
 * US-216); `globals.css` holds none; everything else takes a colour from a token
 * utility (`bg-background`, `text-muted-foreground`, ...) or `var(--token)`. Radii, shadows and spacing are not scanned.
 */

const SRC = resolve(fileURLToPath(new URL("..", import.meta.url)));
const GLOBALS = resolve(SRC, "app/globals.css");
const NAMED = (
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
  "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
  "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
  "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
  "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
  "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen " +
  "lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
  "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
  "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
  "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
  "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver " +
  "skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
  "whitesmoke yellow yellowgreen"
).split(" ");
const PALETTE = "black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY_PREFIX =
  "bg|text|border|ring|ring-offset|inset-ring|inset-shadow|drop-shadow|text-shadow|fill|stroke|from|to|via|divide|outline|shadow|decoration|accent|caret|placeholder";
const NAMED_RE = NAMED.join("|");
const COLOUR_PROPERTY = "[A-Za-z-]*(?:[cC]olor|[bB]ackground|[fF]ill|[sS]troke|[sS]hadow|[bB]order|[oO]utline)";

interface Pattern {
  name: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { name: "hex colour (6 or 8 digits)", re: /(?<![A-Za-z0-9&/?=#-])#(?:[0-9a-f]{8}|[0-9a-f]{6})\b(?!-)/gi },
  { name: "URL-encoded hex colour (6 digits)", re: /%23[0-9a-f]{6}\b/gi },
  { name: "hex colour (3 or 4 digits, in an arbitrary class or a colour property)", re: new RegExp(`(?:\\[|(?:${UTILITY_PREFIX})-\\[[^\\]\\n]*?|(?:${COLOUR_PROPERTY})["']?\\s*[:=][^;\\n]*?)(?<![A-Za-z0-9&/?=#-])#(?:[0-9a-f]{4}|[0-9a-f]{3})\\b(?!-)`, "gi") },
  { name: "colour function", re: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\bcolor\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz)/gi },
  { name: "arbitrary colour class", re: new RegExp(`\\b(?:${UTILITY_PREFIX})-\\[(?:${NAMED_RE})\\]|\\b(?:shadow|inset-shadow|drop-shadow|text-shadow|bg|border|ring|outline)-\\[[^\\]\\n]*?(?:^|[_(,\\s:\\[])(?:${NAMED_RE})(?=[_),\\s\\]/])`, "g") },
  { name: "default-palette utility", re: new RegExp(`(?<![\\w-])(?:${UTILITY_PREFIX})-(?:[trblxyse]-)?(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`, "g") },
  { name: "default-palette fragment in a string (a class built by concatenation)", re: new RegExp(`["'\`](?:${PALETTE})-(?:50|[1-9]00|950)["'\`]`, "g") },
  { name: "typography colour modifier", re: new RegExp(`(?<![\\w-])prose-(?:invert|${PALETTE})(?![\\w-])`, "g") },
  {
    name: "named colour in a colour property",
    // A named colour anywhere in the value, so the shorthand `border: "1px solid red"` is caught as well as `color: "red"`.
    re: new RegExp(`(?<![\\w-])${COLOUR_PROPERTY}["']?\\s*[:=](?:[^;{},\\n]|,(?!\\s*[A-Za-z-]+["']?\\s*[:=]))*?(?<![\\w/.#%-])(?:${NAMED_RE})(?![\\w/.-])`, "gi"),
  },
];

export interface Finding {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

/**
 * Blank out comments, keeping every newline so a finding's line number is the file's. String-aware: a `/*` or `//` inside
 * a quoted string (`"/api/*"`, `"https://x"`) is text, not a comment. `'` and `"` strings end at a newline (they cannot span
 * lines, and a stray apostrophe in JSX text must not swallow the file); a backtick string may span lines.
 */
function withoutComments(text: string): string {
  const out = text.split("");
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && !(c !== "`" && text[j] === "\n")) j += text[j] === "\\" ? 2 : 1;
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const to = end === -1 ? text.length : end + 2;
      blank(i, to);
      i = to;
    } else if (c === "/" && text[i + 1] === "/" && (i === 0 || /[\s;{}(),]/.test(text[i - 1]!))) {
      const end = text.indexOf("\n", i);
      const to = end === -1 ? text.length : end;
      blank(i, to);
      i = to;
    } else i++;
  }
  return out.join("");
}

/** Remove every balanced `var(...)` group, innermost first, so `var(--a, var(--b))` goes whole. */
function withoutVars(value: string): string {
  let prev: string;
  let v = value;
  do {
    prev = v;
    v = v.replace(/\bvar\([^()]*\)/g, "");
  } while (v !== prev);
  return v;
}

/** True when a value, once its `var()` references are removed, still holds a hex, a colour function or a named colour. */
export function hasColourLiteral(value: string): boolean {
  const rest = withoutVars(value);
  return (
    /#[0-9a-f]{3,8}\b/i.test(rest) ||
    /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(rest) ||
    new RegExp(`(?<![\\w-])(?:${NAMED_RE})(?![\\w-])`, "i").test(rest)
  );
}

/**
 * Out of reach by design: a palette class assembled from pieces no regex can join (`bg-${tone}`, `bg-red-${n}`,
 * `"bg-" + "red" + "-500"`). The scan catches a whole fragment such as `"red-500"`, and the palette reset (contract row 1)
 * is what makes the rest harmless: Tailwind generates nothing for a name it never saw whole, and nothing for a palette name.
 *
 * Scan one file's text. The token layer is exempt: a custom-property declaration (`--name: value;`) in the installed `esg-theme.css` (US-216, ADR-020).
 * `*.test.ts(x)` and `*.itest.ts` files are the caller's to skip (they hold fixtures with colours on purpose).
 */
export function scanSource(file: string, text: string): Finding[] {
  const tokenLayer = file.endsWith("esg-theme.css");
  const out: Finding[] = [];
  const clean = withoutComments(text);
  // Innermost open block's selector at the start of each line, so a `--name:` line knows whether it sits in a token block.
  const stack: string[] = [];
  const blockAtLine: string[] = [""];
  let pending = "";
  for (const ch of clean) {
    if (ch === "{") {
      stack.push(pending.trim());
      pending = "";
    } else if (ch === "}") {
      stack.pop();
      pending = "";
    } else if (ch === ";") pending = "";
    else if (ch === "\n") blockAtLine.push(stack[stack.length - 1] ?? "");
    else pending += ch;
  }
  clean.split("\n").forEach((line, i) => {
    const decl = tokenLayer ? /^\s*--[a-z0-9-]+\s*:(.*)$/.exec(line) : null;
    if (decl) {
      // The token layer is the custom properties inside `:root` and the two dark blocks. A `--name` anywhere else is exempt
      // only while its value holds no literal once `var()` references are stripped.
      if (/^:root(?![\w-])/.test(blockAtLine[i] ?? "") || !hasColourLiteral(decl[1]!)) return;
      out.push({ file, line: i + 1, pattern: "colour literal in a custom property outside the token blocks", text: decl[1]!.trim() });
      return;
    }
    for (const { name, re } of PATTERNS) {
      for (const m of line.matchAll(re)) out.push({ file, line: i + 1, pattern: name, text: m[0].trim() });
    }
  });
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(?:[cm]?[jt]sx?|css|scss|svg)$/.test(e.name) && !/\.(?:test|itest)\.[cm]?[jt]sx?$/.test(e.name) ? [p] : [];
  });
}

const format = (f: Finding): string => `${f.file}:${f.line} ${f.pattern}: ${f.text}`;

describe("colour guard: the source scan (US-173, TC-498)", () => {
  it("finds no hand-written colour in web/src outside the token layer", () => {
    const findings = sourceFiles(SRC).flatMap((p) => scanSource(relative(SRC, p), readFileSync(p, "utf8")));
    expect(findings.map(format), "a colour belongs in the ESG tokens (the registry theme), then a token utility").toEqual([]);
  });

  it("names the file and line of a planted inline colour, and the other literal shapes", () => {
    const planted = ['export const X = () => (', '  <p style={{ color: "#ff0000" }}>x</p>', ");"].join("\n");
    const found = scanSource("components/planted.tsx", planted);
    expect(found.map(format)).toEqual(['components/planted.tsx:2 hex colour (6 or 8 digits): #ff0000']);

    const cases: Record<string, string> = {
      'className="bg-[#fff]"': "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      'className="text-[rgb(1,2,3)]"': "colour function",
      "background: hsla(0 0% 0% / .5);": "colour function",
      "color: oklch(0.5 0.1 200);": "colour function",
      'className="bg-red-500"': "default-palette utility",
      'className="hover:text-gray-700"': "default-palette utility",
      'className="bg-black/10"': "default-palette utility",
      'className="border-[red]"': "arbitrary colour class",
      'style={{ backgroundColor: "tomato" }}': "named colour in a colour property",
      '<path fill="red" />': "named colour in a colour property",
      "a { color: #f00; }": "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      // The false negatives the first scanner had (US-173 hardening): side utilities, shorthand values, case, arbitrary shadows.
      'className="border-t-red-500"': "default-palette utility",
      'className="border-x-white"': "default-palette utility",
      'className="inset-ring-white"': "default-palette utility",
      'className="drop-shadow-black"': "default-palette utility",
      'className="text-shadow-red-500"': "default-palette utility",
      'style={{ border: "1px solid red" }}': "named colour in a colour property",
      'style={{ boxShadow: "0 0 0 1px red" }}': "named colour in a colour property",
      'style={{ background: "url(x) no-repeat red" }}': "named colour in a colour property",
      "a { background: linear-gradient(red, blue); }": "named colour in a colour property",
      'style={{ color: "Red" }}': "named colour in a colour property",
      "a { color: RED; }": "named colour in a colour property",
      'className="shadow-[0_0_0_1px_#fff]"': "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      'className="shadow-[0_0_0_1px_#ffffff]"': "hex colour (6 or 8 digits)",
      'className="shadow-[0_0_0_1px_red]"': "arbitrary colour class",
      // SVG in JSX, and the other literal spellings
      '<path fill="#fff" />': "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      "<path fill='#abc' />": "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      '<path fill={"#abc"} />': "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      '<path stroke="white" />': "named colour in a colour property",
      '<circle stopColor="#fff" />': "hex colour (3 or 4 digits, in an arbitrary class or a colour property)",
      "color: rgb( 1, 2, 3 );": "colour function",
      "color: RGB(1 2 3);": "colour function",
      "color: color(display-p3 1 0 0);": "colour function",
      "const c = `#ff000080`;": "hex colour (6 or 8 digits)",
      "const c = `${a}#ff000080`;": "hex colour (6 or 8 digits)",
      'const c = `x ${a} #ff000080`;': "hex colour (6 or 8 digits)",
      'const url = "data:image/svg+xml,%3Csvg fill=\'%23ff0000\'%3E";': "URL-encoded hex colour (6 digits)",
      // Palette classes assembled from string literals: caught when a whole `red-500` literal is present.
      "const t = 'bg-' + 'red-500';": "default-palette fragment in a string (a class built by concatenation)",
      "const tone = `slate-900`;": "default-palette fragment in a string (a class built by concatenation)",
      'className="prose-invert"': "typography colour modifier",
      'className="md:prose-slate"': "typography colour modifier",
    };
    for (const [source, pattern] of Object.entries(cases)) {
      expect(scanSource("x.tsx", source).map((f) => f.pattern), source).toContain(pattern);
    }
  });

  it("accepts what is not a colour", () => {
    const fine = [
      'className="bg-transparent text-current border-inherit bg-background text-muted-foreground border-border bg-scrim"',
      "outline-color: currentColor;",
      "color: inherit;",
      'const href = "/w/abc#section-1";',
      'const link = "#add";',
      'const id = "#face"; // an anchor, not a colour',
      'document.querySelector("#main-content");',
      "#main-content:target { scroll-margin-top: 1rem }",
      "a[href^='#cafe'] { text-decoration: underline }",
      "const heading = `${base}#${slug}`;",
      "const red = 1; const green = 2; // variables named for colours",
      'className="text-red-foreground"',
      "/* rgba(1, 2, 3, 0.5) in a comment */",
      'const x = "grayscale"; const border = "none";',
      'style={{ border: "1px solid var(--border)", outline: "none" }}',
      'style={{ border: "none", content: "tan" }}',
      "a { background: url(/img/red.png) no-repeat; }",
      'className="bg-[url(/img/red.png)] shadow-[0_0_0_1px_var(--ring)] bg-(--surface)"',
      'const href = "/w/a%23section"; const id = "%23add";',
      'const k = "redwood-500"; const m = "red-foreground"; const p = "prose prose-sm max-w-none";',
    ].join("\n");
    expect(scanSource("components/fine.tsx", fine).map(format)).toEqual([]);
  });

  it("exempts the token blocks in the installed esg-theme.css, and only there", () => {
    const decl = "    --primary: #6c47ff;\n    --shade-hover: rgba(19, 19, 22, 0.14);";
    const root = `:root {\n${decl}\n}`;
    const dark = `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n${decl}\n  }\n}`;
    expect(scanSource("app/esg-theme.css", root)).toEqual([]);
    expect(scanSource("app/esg-theme.css", dark)).toEqual([]);
    expect(scanSource("app/other.css", root).map((f) => f.line)).toEqual([2, 3]);
    // globals.css holds no token any more (US-216), so it is no longer exempt.
    expect(scanSource("app/globals.css", root).map((f) => f.line)).toEqual([2, 3]);
    expect(scanSource("app/esg-theme.css", "p { color: #ff0000; }").map(format)).toEqual(["app/esg-theme.css:1 hex colour (6 or 8 digits): #ff0000"]);
  });

  it("outside the token blocks a custom property is exempt only while its value, minus var(), holds no literal", () => {
    const wrap = (d: string): string => `.wr-prose {\n    ${d}\n}`;
    for (const ok of ["--kbd-shadow: color-mix(in srgb, var(--foreground) 10%, transparent);", "--body: var(--foreground);", "--x: var(--a, var(--b));"]) {
      expect(scanSource("app/esg-theme.css", wrap(ok)).map(format), ok).toEqual([]);
    }
    for (const bad of [
      "--x: color-mix(in srgb, #f00 50%, var(--x));",
      "--x: linear-gradient(red, var(--x));",
      "--x: oklch(0.5 0.1 200);",
      "--x: var(--a) #fff;",
    ]) {
      expect(scanSource("app/esg-theme.css", wrap(bad)).map((f) => `${f.line} ${f.pattern}`), bad).toEqual(["2 colour literal in a custom property outside the token blocks"]);
    }
  });

  it("does not treat a `/*` or `//` inside a string as a comment, and still blanks real comments", () => {
    const text = ['const glob = "/api/*";', 'const style = { color: "#ff0000" };', "/* a real comment, with #00ff00 */", 'const u = "https://x.test/a";'].join("\n");
    expect(scanSource("components/glob.tsx", text).map(format)).toEqual(['components/glob.tsx:2 hex colour (6 or 8 digits): #ff0000']);
    const later = ['const glob = "/api/*";', 'const style = { color: "#ff0000" };', "const t = `x`; // note */"].join("\n");
    expect(scanSource("components/glob2.tsx", later).map((f) => f.line)).toEqual([2]);
    expect(scanSource("components/apos.tsx", ["const a = <p>Don't</p>;", 'const s = { color: "#ff0000" };'].join("\n")).map((f) => f.line)).toEqual([2]);
  });
});

describe("colour guard: the palette reset (US-173 contract row 1)", () => {
  const requireFromHere = createRequire(import.meta.url);
  const tailwindDir = dirname(requireFromHere.resolve("tailwindcss/package.json"));

  /**
   * `globals.css` through Tailwind itself, with the `wr-prose.css` import resolved for real. Only `tw-animate-css` is left out;
   * its own file is scanned below for colour instead.
   */
  async function generate(candidates: string[]): Promise<string> {
    const source = readFileSync(GLOBALS, "utf8").replace(/^@import "tw-animate-css";$/m, "");
    const compiler = await compile(source, {
      base: dirname(GLOBALS),
      loadStylesheet: async (id, base) => {
        const path = id === "tailwindcss" ? resolve(tailwindDir, "index.css") : resolve(base, id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
      loadModule: async (id, base) => {
        const m = (await import(pathToFileURL(requireFromHere.resolve(id, { paths: [base] })).href)) as { default?: unknown };
        return { path: id, base, module: m.default ?? m };
      },
    });
    return compiler.build(candidates);
  }

  it("makes default-palette utilities generate no rule, and token utilities generate one", async () => {
    const css = await generate([
      "bg-red-500",
      "text-gray-700",
      "bg-black/10",
      "bg-white",
      "border-blue-200",
      "bg-background",
      "text-muted-foreground",
      "border-border",
      "bg-scrim",
    ]);
    for (const dead of [".bg-red-500", ".text-gray-700", ".bg-black\\/10", ".bg-white", ".border-blue-200"]) {
      expect(css, dead).not.toContain(dead);
    }
    for (const live of [".bg-background", ".text-muted-foreground", ".border-border", ".bg-scrim"]) {
      expect(css, live).toContain(live);
    }
    expect(css).toMatch(/\.bg-scrim\s*\{[^}]*var\(--scrim\)/);
  }, 15_000);

  it("keeps transparent, currentColor and inherit usable", async () => {
    const css = await generate(["bg-transparent", "text-current", "border-inherit", "text-inherit"]);
    expect(css).toMatch(/\.bg-transparent\s*\{[^}]*transparent/);
    expect(css).toMatch(/\.text-current\s*\{[^}]*currentcolor/i);
    expect(css).toMatch(/\.border-inherit\s*\{[^}]*inherit/);
  }, 15_000);

  it("`tw-animate-css` brings no colour (Tailwind Typography is gone, US-189)", async () => {
    const animate = readFileSync(resolve(dirname(GLOBALS), "../../node_modules/tw-animate-css/dist/tw-animate.css"), "utf8");
    expect(scanSource("tw-animate.css", animate).map(format)).toEqual([]);
  }, 15_000);
});
