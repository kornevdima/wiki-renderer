import type { Element, Root } from "hast";
import rehypeSanitize from "rehype-sanitize";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { sanitizeSchema, SHIKI_SPAN_STYLE } from "./sanitize-schema";

/**
 * US-190 (ADR-008 amendment 2026-10-05, TC-502): the sanitiser schema's Shiki allowance, exercised by behaviour on
 * hand-built hast, so the RegExp entry is tested as the sanitiser applies it and not as a string list. This allowance
 * bounds the CSP's `style-src-attr 'unsafe-inline'` (ADR-016 R-1): one anchored pattern on `span`, nothing on `pre`.
 */

const el = (tagName: string, properties: Element["properties"], children: Element["children"] = []): Element => ({ type: "element", tagName, properties, children });
function sanitised(node: Element): Element {
  const out = unified().use(rehypeSanitize, sanitizeSchema).runSync({ type: "root", children: [node] } as Root) as Root;
  return out.children[0] as Element;
}
/** The `style` a lone span keeps after the sanitiser, or `undefined`. */
const spanStyle = (style: unknown) => sanitised(el("span", { style: style as string })).properties?.style;
/** The classes a lone `pre` keeps; the sanitiser leaves `[]` when none survive, which renders no `class` attribute. */
const preClasses = (className: string[]) => sanitised(el("pre", { className })).properties?.className ?? [];

describe("the span style pattern (ADR-008 amendment 2026-10-05)", () => {
  it("is exactly the approved anchored pattern, with no flags", () => {
    expect(SHIKI_SPAN_STYLE.source).toBe("^color:var\\(--shiki-(?:foreground|token-[a-z-]+)\\)$");
    expect(SHIKI_SPAN_STYLE.flags).toBe("");
    expect(sanitizeSchema.attributes?.span).toContainEqual(["style", SHIKI_SPAN_STYLE]);
  });

  it("keeps every colour Shiki's css-variables theme can emit", () => {
    for (const v of ["foreground", "token-keyword", "token-function", "token-string", "token-string-expression", "token-constant", "token-comment", "token-punctuation", "token-parameter", "token-link", "token-inserted", "token-deleted", "token-changed"]) {
      const style = `color:var(--shiki-${v})`;
      expect(spanStyle(style), style).toBe(style);
    }
  });

  it("M2: drops anything beyond the one colour form", () => {
    for (const bad of [
      "color:var(--shiki-token-keyword);position:fixed", // a second declaration
      "color:var(--shiki-token-keyword);", // a trailing semicolon
      "color:red",
      "color:#fff",
      "--shiki-token-x:red", // a custom-property definition
      "--shiki-token-keyword:red;position:fixed;inset:0",
      "color:var(--shiki-token-keyword)\n;position:fixed",
      "color:var(--shiki-token-keyword)\n",
      " color:var(--shiki-token-keyword)",
      "color: var(--shiki-token-keyword)",
      "COLOR:var(--shiki-token-keyword)",
      "color:var(--other-token-keyword)",
      "color:var(--shiki-token-Keyword)",
      "color:var(--shiki-token-1)",
      "color:var(--shiki-background)",
      "color:var(--shiki-light)",
      "color:var(--shiki-token-keyword,red)",
      "color:var(--shiki-token-keyword) !important",
      "background:url(https://x.example/a.png)",
      "background-color:var(--shiki-foreground)",
      "color:url(x)",
      "font-style:italic",
      "",
    ]) {
      expect(spanStyle(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it("M2: no non-string style value gets through, and an array is checked item by item", () => {
    for (const bad of [true, 1, { color: "red" }]) expect(spanStyle(bad), JSON.stringify(bad)).toBeUndefined();
    // hast-util-sanitize filters an array's items one at a time (an array `style` cannot come from the parser or Shiki, which
    // write strings): whatever survives still matches the pattern, and a bad item never does.
    for (const list of [["color:red"], ["color:var(--shiki-foreground)", "position:fixed"], ["position:fixed", "--shiki-token-x:red"]]) {
      const kept = spanStyle(list);
      for (const item of (kept ?? []) as string[]) expect(item, JSON.stringify(list)).toMatch(SHIKI_SPAN_STYLE);
    }
  });

  it("allows no style on any other element, in the exact form or not", () => {
    for (const tag of ["pre", "code", "div", "p", "a", "table", "details", "h2", "kbd", "abbr", "img"]) {
      const out = sanitised(el(tag, { style: "color:var(--shiki-token-keyword)", src: "https://x.example/a.png" }));
      expect(out.properties?.style, tag).toBeUndefined();
    }
  });
});

describe("the pre class list (ADR-008 amendment 2026-10-05)", () => {
  it("pins the schema entry: className exactly shiki and css-variables, tabIndex 0, and no style", () => {
    const pre = sanitizeSchema.attributes?.pre ?? [];
    expect(pre).toContainEqual(["className", "shiki", "css-variables"]);
    expect(pre).toContainEqual(["tabIndex", 0]);
    expect(pre.filter((e) => (Array.isArray(e) ? e[0] : e) === "className")).toHaveLength(1);
    expect(pre.some((e) => (Array.isArray(e) ? e[0] : e) === "style")).toBe(false);
  });

  it("keeps shiki and css-variables, and tabIndex 0", () => {
    expect(preClasses(["shiki", "css-variables"])).toEqual(["shiki", "css-variables"]);
    expect(sanitised(el("pre", { tabIndex: 0 })).properties?.tabIndex).toBe(0);
    expect(sanitised(el("pre", { tabIndex: -1 })).properties?.tabIndex).toBeUndefined();
  });

  it("M3: strips the old theme classes and any other class", () => {
    expect(preClasses(["shiki", "shiki-themes", "github-light", "github-dark"])).toEqual(["shiki"]);
    expect(preClasses(["shiki-themes", "github-dark"])).toEqual([]);
    expect(preClasses(["github-light"])).toEqual([]);
    expect(preClasses(["shiki", "css-variables", "evil"])).toEqual(["shiki", "css-variables"]);
    expect(preClasses(["Shiki", "CSS-variables"])).toEqual([]);
  });

  it("strips a style on pre, whatever it holds", () => {
    for (const style of ["background-color:var(--shiki-background);color:var(--shiki-foreground)", "color:var(--shiki-foreground)", "background:url(x)"]) {
      expect(sanitised(el("pre", { style, className: ["shiki", "css-variables"] })).properties?.style, style).toBeUndefined();
    }
  });
});
