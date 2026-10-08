/**
 * US-072 unit specs (contract K1-K8, TC-204, TC-205, TC-442, TC-443), through `renderPage` with a primed highlighter.
 */
import { emptyLinkMap } from "@/content/links/link-map.testing";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { getHighlighter, MAX_HIGHLIGHT_CHARS, primeHighlighter } from "./highlighter";
import { SHIKI_SPAN_STYLE } from "./sanitize-schema";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { resetHighlighterForTests } from "./highlighter.testing";

const enc = new TextEncoder();
let counter = 0;
function html(md: string): string {
  const files = new Map<string, FileEntry>([["p.md", { bytes: enc.encode(md), contentType: "text/markdown" }]]);
  const snapshot: WikiSnapshot = {
    wikiId: "w",
    sha: `s${counter++}`,
    files,
    pages: parsePages(files),
    linkMap: emptyLinkMap(),
    searchIndexJson: "",
    tree: [],
  };
  const r = renderPage(snapshot, "p.md");
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}
const fence = (info: string, body: string) => "```" + info + "\n" + body + "\n```\n";
const isHighlighted = (out: string) => out.includes('class="shiki');

beforeAll(async () => {
  await primeHighlighter();
});
beforeEach(() => resetRenderCacheForTests());

describe("US-072 highlighting", () => {
  it("K1 (US-190): a ts fence is the exact css-variables markup, pinned from a real Shiki 4.4.3 run (ADR-010, ADR-008)", () => {
    const out = html(fence("ts", "// c\nconst a: number = 1;"));
    expect(out).toBe(
      '<pre class="shiki css-variables" tabindex="0"><code>' +
        '<span class="line"><span style="color:var(--shiki-token-comment)">// c</span></span>\n' +
        '<span class="line"><span style="color:var(--shiki-token-keyword)">const</span><span style="color:var(--shiki-token-constant)"> a</span>' +
        '<span style="color:var(--shiki-token-keyword)">:</span><span style="color:var(--shiki-token-constant)"> number</span>' +
        '<span style="color:var(--shiki-token-keyword)"> =</span><span style="color:var(--shiki-token-constant)"> 1</span>' +
        '<span style="color:var(--shiki-foreground)">;</span></span></code></pre>',
    );
  });

  it("K1 (US-190): the pre has class exactly `shiki css-variables`, tabindex 0 and no style; every span style is the one allowed colour form; the old classes and variables are gone", () => {
    const out = html(fence("ts", "export function f(a: number): string { return `t${a}`; } // c\n") + fence("md", "# H *em* [l](u) `c`") + fence("diff", "+ a\n- b\n c"));
    const pres = [...out.matchAll(/<pre([^>]*)>/g)].map((m) => m[1]);
    expect(pres).toEqual(Array(3).fill(' class="shiki css-variables" tabindex="0"'));
    const styles = [...out.matchAll(/ style="([^"]*)"/g)].map((m) => m[1]!);
    expect(styles.length).toBeGreaterThan(10);
    for (const st of styles) expect(st).toMatch(SHIKI_SPAN_STYLE);
    // An unscoped token emits the foreground variable, not a token variable (measured, ADR-010 amendment point 1).
    expect(styles).toContain("color:var(--shiki-foreground)");
    expect(styles).toContain("color:var(--shiki-token-string-expression)");
    expect(out).not.toMatch(/github-(light|dark)|shiki-themes|--shiki-(light|dark)|--shiki-background|font-style|font-weight|text-decoration/);
    // The outer element of every `style` is a span: pre/code carry none.
    expect(out.match(/<(?!span)[a-z]+[^>]* style=/g)).toBeNull();
  });

  it("K1 (US-190): a diff keeps its leading + and - and the inserted and deleted variables", () => {
    const out = html(fence("diff", "+ added\n- removed\n kept"));
    expect(out).toContain('<span style="color:var(--shiki-token-inserted)">+ added</span>');
    expect(out).toContain('<span style="color:var(--shiki-token-deleted)">- removed</span>');
    expect(out).toContain('<span style="color:var(--shiki-foreground)"> kept</span>');
  });

  it("K1: every one of the eleven preloaded languages highlights", () => {
    for (const lang of ["ts", "tsx", "js", "jsx", "json", "bash", "yaml", "markdown", "python", "sql", "diff"]) {
      expect(isHighlighted(html(fence(lang, "x"))), lang).toBe(true);
    }
  });

  it("K2: an unlisted language renders plain, with its language class and no error", () => {
    const out = html(fence("rust", "fn main() {}"));
    expect(isHighlighted(out)).toBe(false);
    expect(out).toContain('<pre tabindex="0"><code class="language-rust">fn main() {}\n</code></pre>');
  });

  it("K3: no language renders plain", () => {
    const out = html(fence("", "plain text"));
    expect(out).toBe('<pre tabindex="0"><code>plain text\n</code></pre>');
  });

  it("K4: indentation and line breaks are verbatim and Markdown inside is inert", () => {
    const body = "  if (x) {\n\treturn **not bold**;\n\n  }";
    const out = html(fence("ts", body));
    const text = out.replace(/<[^>]+>/g, "").replace(/&#x27;|&quot;|&amp;|&lt;|&gt;/g, (m) => ({ "&#x27;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">" })[m]!);
    expect(text).toBe(body);
    expect(out).not.toContain("<strong>");
  });

  it("K5 (TC-204): the language tag is case-insensitive, all casings highlight identically", () => {
    const [a, b, c] = ["ts", "TS", "Ts"].map((l) => html(fence(l, "let a = 1;")));
    expect(isHighlighted(a!)).toBe(true);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("K6 (TC-205): HTML-like text inside a fence is literal text", () => {
    const out = html(fence("html", '<script>alert(1)</script><img src=x onerror="y">'));
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    const ts = html(fence("ts", 'const s = "<img src=x onerror=1>";'));
    expect(ts).not.toContain("<img");
    expect(ts).toContain("&lt;");
  });

  it("K7 (TC-442): info-string extras are inert and do not misroute; hostile tags produce no markup", () => {
    const plain = html(fence("ts", "let a = 1;"));
    expect(html(fence("ts {1,3}", "let a = 1;"))).toBe(plain);
    expect(html(fence('ts title="a.ts"', "let a = 1;"))).toBe(plain);
    expect(html(fence("ts   ", "let a = 1;"))).toBe(plain);
    const hostile = html(fence('ts" onload="x', "let a = 1;"));
    expect(isHighlighted(hostile)).toBe(false);
    expect(hostile).not.toMatch(/onload=/);
    expect(html(fence("", "x"))).toBe('<pre tabindex="0"><code>x\n</code></pre>');
  });

  it("K7 (TC-442): a mermaid fence is never highlighted (the placeholder wins)", () => {
    const out = html(fence("mermaid", "graph TD\n A-->B"));
    expect(isHighlighted(out)).toBe(false);
    expect(out).toContain("data-mermaid-id");
  });

  it("K7 (TC-442): a block over the ceiling renders plain, quickly, and just under it highlights", () => {
    const big = "let a = 1;\n".repeat(Math.ceil((MAX_HIGHLIGHT_CHARS + 10) / 11));
    const t0 = performance.now();
    const out = html(fence("ts", big));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(isHighlighted(out)).toBe(false);
    expect(out).toContain('<code class="language-ts">');
    const oneMb = html(fence("ts", "x".repeat(1_000_000)));
    expect(isHighlighted(oneMb)).toBe(false);
    expect(isHighlighted(html(fence("ts", "a".repeat(MAX_HIGHLIGHT_CHARS - 1))))).toBe(true);
  });

  // BUG-025: 4,692 ms in Cloud Build a2eb8ac3 (shared E2_HIGHCPU_8) against the 5 s default, so it gets its own ceiling.
  const BUG_025_TIMEOUT_MS = 15_000;
  it("K10 (W2-15): a page of 5 x 40k-character blocks highlights the first two and renders the last three plain", () => {
    const block = "let a = 1;\n".repeat(Math.ceil(40_000 / 11)).slice(0, 40_000);
    const out = html([1, 2, 3, 4, 5].map((i) => fence("ts", `// ${i}\n${block}`)).join("\n"));
    expect(out.match(/<pre class="shiki css-variables" tabindex="0">/g)).toHaveLength(2);
    expect(out.match(/<pre tabindex="0"><code class="language-ts">/g)).toHaveLength(3);
    expect(out.indexOf("// 3")).toBeGreaterThan(out.lastIndexOf('class="shiki'));
    // The budget is per render: a fresh render of another page starts full.
    expect(isHighlighted(html(fence("ts", "let a = 1;")))).toBe(true);
  }, BUG_025_TIMEOUT_MS);

  it("K8 (TC-443): author raw style / class shiki / tabindex reach the output with none of them", () => {
    const out = html(
      [
        '<span style="color:red">red</span>',
        '<pre class="shiki css-variables" style="--shiki-token-keyword:red" tabindex="0">forged</pre>',
        '<span class="line" style="--shiki-dark:#000">line</span>',
        '<p style="position:fixed">p</p>',
        "",
      ].join("\n\n"),
    );
    expect(out).not.toMatch(/style=/);
    expect(out).not.toMatch(/shiki|css-variables|github-dark|github-light/);
    expect(out).not.toContain('class="line"');
    // US-189 fix round 1: every plain pre is one trusted tab stop (value 0); the forged one adds no other attribute.
    expect(out.match(/tabindex/g)).toHaveLength(1);
    expect(out).toContain('<pre tabindex="0">forged</pre>');
    for (const t of ["red", "forged", "line"]) expect(out).toContain(t);
  });

  it("K8: a forged inline style inside a highlighted page is still stripped while Shiki's own survives", () => {
    const out = html(fence("ts", "let a = 1;") + '\n<span style="color:red">x</span>\n');
    expect(out).not.toContain("color:red");
    expect(isHighlighted(out)).toBe(true);
  });

  describe("TC-502 (US-190): author markup cannot forge Shiki token variables or theme attributes", () => {
    /** Every `style=` in the output must sit on a span inside a Shiki block and match the one allowed colour form. */
    function expectOnlyShikiStyles(out: string): void {
      const withoutShiki = out.replace(/<pre class="shiki css-variables" tabindex="0">[\s\S]*?<\/pre>/g, "");
      // BUG-035: the only style allowed outside Shiki output is a text-align on a table cell (from an `align` attribute).
      for (const m of withoutShiki.matchAll(/<(\w+)[^>]* style="([^"]*)"/gi)) {
        expect(["td", "th"], "a style outside Shiki output").toContain(m[1]!.toLowerCase());
        expect(m[2]).toMatch(CELL_TEXT_ALIGN);
      }
      for (const m of out.matchAll(/<(\w+)[^>]* style="([^"]*)"/g)) {
        if (m[1] === "td" || m[1] === "th") continue;
        expect(m[1]).toBe("span");
        expect(m[2]).toMatch(SHIKI_SPAN_STYLE);
      }
    }
    const CELL_TEXT_ALIGN = /^text-align:\s*(?:left|right|center|justify);?$/;

    it("the TC-502 step 1 payloads: forged pre class and style, span with a variable plus position, div.shiki, old theme classes, html data-theme, p style", () => {
      const out = html(
        [
          '<pre class="shiki css-variables" style="background:url(x)">forged pre</pre>',
          '<span style="--shiki-token-keyword:red;position:fixed;inset:0">forged span</span>',
          '<div class="shiki css-variables">forged div</div>',
          '<pre class="shiki-themes github-dark">old classes</pre>',
          '<html data-theme="dark"><body>forged theme</body></html>',
          '<p style="color:red">forged p</p>',
          '<span style="color:var(--shiki-token-keyword)">author span in the exact allowed form</span>',
          '<span class="line">line</span>',
          "",
        ].join("\n\n"),
      );
      // An old-theme class list is removed by the schema, leaving an empty class attribute at worst (as for any `pre class="x"`).
      expect(out).not.toMatch(/style=|shiki|css-variables|github-|data-theme|class="[^"]/i);
      expect(out).not.toMatch(/position|background|url\(|inset|color:/);
      for (const t of ["forged pre", "forged span", "forged div", "old classes", "forged theme", "forged p", "author span in the exact allowed form"]) expect(out).toContain(t);
      // Every pre is a plain, trusted tab stop and nothing else.
      expect(out.match(/<pre[^>]*>/g)).toEqual(['<pre tabindex="0">', '<pre class="" tabindex="0">']);
    });

    it("BUG-035 (review minor 2): a table cell align with a semicolon payload leaves no style except an allowed text-align", () => {
      const out = html(
        [
          '<table><tr><td align="left;position:fixed;inset:0">forged-td</td><th align="center;background:url(x)">forged-th</th></tr></table>',
          '<table><tr><td align="right">ok-right</td><th align="justify">ok-justify</th></tr></table>',
          '<table align="center"><tr><td>plain</td></tr></table>',
          '<p align="center">para</p>',
          "",
        ].join("\n\n"),
      );
      expect(out).not.toMatch(/position|inset|url\(|background/);
      for (const t of ["forged-td", "forged-th", "ok-right", "ok-justify", "plain", "para"]) expect(out).toContain(t);
      expectOnlyShikiStyles(out);
      const cellStyles = [...out.matchAll(/<(?:td|th)[^>]* style="([^"]*)"/g)].map((m) => m[1]);
      expect(cellStyles.length, "the exact-value cells keep a text-align").toBeGreaterThanOrEqual(2);
      for (const s of cellStyles) expect(s).toMatch(CELL_TEXT_ALIGN);
      expect(out).not.toMatch(/<table[^>]* style=/);
    });

    it("an author payload beside a real fence: only the fence's own spans carry a style", () => {
      const out = html(
        [
          fence("ts", "const a = 1;"),
          '<span style="color:var(--shiki-token-keyword)">forged</span>',
          '<pre class="shiki css-variables" style="color:var(--shiki-foreground)">forged pre</pre>',
          "",
        ].join("\n"),
      );
      expect(isHighlighted(out)).toBe(true);
      expect(out).toContain("forged");
      expect(out.match(/<pre[^>]*>/g)).toEqual(['<pre class="shiki css-variables" tabindex="0">', '<pre tabindex="0">']);
      expectOnlyShikiStyles(out);
    });

    it("a fence body holding style=\"color:red\" and </span><span style=...> appears as escaped text, never as markup", () => {
      const body = 'style="color:red" </span><span style="position:fixed;color:red">x</span>';
      for (const lang of ["ts", "html", "md", ""]) {
        const out = html(fence(lang, body));
        const text = out.replace(/<[^>]+>/g, "").replace(/&quot;|&lt;|&gt;|&#x27;|&amp;/g, (e) => ({ "&quot;": '"', "&lt;": "<", "&gt;": ">", "&#x27;": "'", "&amp;": "&" })[e]!);
        expect(text.trimEnd(), lang).toBe(body);
        expect(out, lang).not.toContain("position:fixed;color:red\"");
        expect(out, lang).not.toMatch(/<span[^>]* style="[^"]*position/);
        expectOnlyShikiStyles(out);
      }
    });
  });

  it("fail closed: an unprimed highlighter renders every fence plain and never throws", () => {
    resetHighlighterForTests();
    expect(getHighlighter()).toBeUndefined();
    const out = html(fence("ts", "let a = 1;"));
    expect(out).toBe('<pre tabindex="0"><code class="language-ts">let a = 1;\n</code></pre>');
  });
});
