import { emptyLinkMap } from "@/content/links/link-map.testing";
import { renderToStaticMarkup } from "react-dom/server";
import rehypeSanitize from "rehype-sanitize";
import type { Element, Root } from "hast";
import { beforeEach, describe, expect, it } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import messages from "../../../messages/en.json";
import { CALLOUT_CLASS_TOKENS, CALLOUT_CONTAINER_CLASSES, CALLOUT_TYPES } from "./callouts";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { sanitizeSchema } from "./sanitize-schema";
import { RESERVED_CLASS_TOKENS, RESERVED_PROPERTIES } from "./strip-author-attrs";

const enc = new TextEncoder();
let n = 0;
function snapshotOf(text: string): WikiSnapshot {
  const files = new Map<string, FileEntry>([["p.md", { bytes: enc.encode(text), contentType: "text/markdown" }]]);
  return { wikiId: "w", sha: `sha${n++}`, files, pages: parsePages(files), linkMap: emptyLinkMap(), searchIndexJson: "", tree: [] };
}
function html(text: string): string {
  const r = renderPage(snapshotOf(text), "p.md");
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}
const ICON = '<span class="callout-icon" aria-hidden="true"></span>';

beforeEach(() => resetRenderCacheForTests());

const U = (text: string) =>
  `<span class="wikilink-unavailable" title="This link has no target in this wiki.">${text}<span class="wikilink-unavailable-indicator" aria-hidden="true"></span><span class="wikilink-unavailable-text">unavailable link</span></span>`;

describe("callouts: US-073", () => {
  it("C1: [!warning] is div.callout.callout-warning[role=alert] with a title holding the icon, not a blockquote", () => {
    const out = html("> [!warning]\n> Careful now\n");
    expect(out).toBe(
      `<div class="callout callout-warning" role="alert"><div class="callout-title">${ICON}Warning</div><p>Careful now</p></div>`,
    );
    expect(out).not.toContain("blockquote");
  });
  it("C2: an unknown type is .callout-default[role=note] titled with the capitalised type, never a blockquote", () => {
    const out = html("> [!custom-type]\n> body\n");
    expect(out).toContain('<div class="callout callout-default" role="note">');
    expect(out).toContain(`<div class="callout-title">${ICON}Custom-type</div>`);
    expect(out).not.toContain("blockquote");
    expect(out).not.toContain("callout-custom");
  });
  it("C3: [!note] carries role=note and an aria-hidden icon", () => {
    const out = html("> [!note]\n> x\n");
    expect(out).toContain('class="callout callout-note" role="note"');
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(1);
  });
  it("C4: each of the seven types gets its role and default title; case does not matter (TC-206)", () => {
    for (const t of CALLOUT_TYPES) {
      const role = t === "warning" || t === "danger" ? "alert" : "note";
      const title = messages.callouts.titles[t];
      for (const marker of [t, t.toUpperCase(), t[0]!.toUpperCase() + t.slice(1)]) {
        const out = html(`> [!${marker}]\n> x\n`);
        expect(out, marker).toContain(`<div class="callout callout-${t}" role="${role}">`);
        expect(out, marker).toContain(`${ICON}${title}</div>`);
      }
    }
    expect(messages.callouts.titles).toEqual({
      note: "Note",
      info: "Info",
      tip: "Tip",
      warning: "Warning",
      danger: "Danger",
      success: "Success",
      important: "Important",
    });
  });
  it("C5: the title keeps inline markup and a wikilink; no title falls back to the type; - and + are consumed", () => {
    const out = html("> [!warning] Partly superseded by **bold** [[DEC-013 X]]\n> body\n");
    expect(out).toContain(`<div class="callout-title">${ICON}Partly superseded by <strong>bold</strong> ${U("DEC-013 X")}</div>`);
    expect(html("> [!tip]\n> body\n")).toContain(`${ICON}Tip</div>`);
    for (const fold of ["-", "+"]) {
      const o = html(`> [!note]${fold} Folded\n> body\n`);
      expect(o).toContain(`${ICON}Folded</div><p>body</p>`);
      expect(o).not.toMatch(/details|summary|button|open/);
      expect(html(`> [!note]${fold}\n> body\n`)).toContain(`${ICON}Note</div>`);
    }
  });
  it("C5: the title is the marker line only; the next lines are the body, with inline markup intact", () => {
    const out = html("> [!info] Title *em*\n> line two `code`\n>\n> second paragraph\n");
    expect(out).toContain(`${ICON}Title <em>em</em></div><p>line two <code>code</code></p><p>second paragraph</p>`);
  });
  it("C6: a hostile type cannot inject an attribute or a class, and its text is escaped (TC-207)", () => {
    for (const t of [`a"b'c&d`, "x&lt;img src=x onerror=alert(1)&gt;", "custom&quot;&gt;&lt;b&gt;", "\\_\\_proto\\_\\_", "constructor", "toString"]) {
      const out = html(`> [!${t}]\n> body\n`);
      expect(out, t).toContain('<div class="callout callout-default" role="note">');
      expect(out, t).not.toMatch(/<script|<img|<b>|<[^>]*onerror/);
      expect(out.match(/class="[^"]*"/g), t).toEqual(['class="callout callout-default"', 'class="callout-title"', 'class="callout-icon"']);
    }
    // Real markup in the marker splits the first text node, so it is not a marker at all: still no live element.
    for (const raw of ['> [!"><img src=x onerror=alert(1)>]\n> body\n', '> [!custom"><script>alert(1)</script>]\n> body\n']) {
      const out = html(raw);
      expect(out).not.toMatch(/onerror|<script/); // a sanitised <img src=x> may survive; its handler may not
      expect(out).toContain("<blockquote>");
      expect(out).not.toContain("callout");
    }
    const long = "z".repeat(50_000);
    const out = html(`> [!${long}]\n> body\n`);
    expect(out).toContain(`${ICON}Z${"z".repeat(49_999)}</div>`);
    expect(out).toContain("callout-default");
  });
  it("W3-5: whitespace around the type is trimmed before the lookup; a blank type is not a marker", () => {
    expect(html("> [!note ]\n> x\n")).toContain(`<div class="callout callout-note" role="note"><div class="callout-title">${ICON}Note</div>`);
    expect(html("> [! WARNING ] Careful\n> x\n")).toContain(`class="callout callout-warning" role="alert"`);
    expect(html("> [! ]\n> x\n")).toContain("<blockquote>");
  });
  it("C7: an author-written callout container (raw HTML) carries no role and no callout class", () => {
    const out = html(
      '<div class="callout callout-warning" role="alert"><span class="callout-icon" aria-hidden="true">i</span><div class="callout-title keep">t</div></div>\n',
    );
    expect(out).not.toMatch(/role=|aria-hidden|callout-warning|callout-icon|class="callout/);
    expect(html('<p role="alert" class="callout-note">x</p>')).toBe("<p>x</p>");
  });
  it("C7: the reserved list carries role, ariaHidden and every callout class name", () => {
    expect(RESERVED_PROPERTIES).toContain("role");
    expect(RESERVED_PROPERTIES).toContain("ariaHidden");
    for (const c of CALLOUT_CLASS_TOKENS) expect(RESERVED_CLASS_TOKENS).toContain(c);
    expect([...CALLOUT_CONTAINER_CLASSES].sort()).toEqual(
      ["callout", "callout-note", "callout-info", "callout-tip", "callout-warning", "callout-danger", "callout-success", "callout-important", "callout-default"].sort(),
    );
  });
  it("C7: the schema allows `role` on div only, exactly {alert, note}; the sanitiser alone drops any other value (dedicated pin)", () => {
    const withRole = Object.entries(sanitizeSchema.attributes ?? {})
      .filter(([, l]) => l.some((e) => (Array.isArray(e) ? e[0] : e) === "role"))
      .map(([tag]) => tag);
    expect(withRole).toEqual(["div"]);
    expect(sanitizeSchema.attributes?.div).toContainEqual(["role", "alert", "note"]);
    const el = (tagName: string, properties: Element["properties"]): Element => ({ type: "element", tagName, properties, children: [] });
    const tree: Root = {
      type: "root",
      children: [
        el("div", { role: "button" }),
        el("div", { role: "alert" }),
        el("div", { role: "note" }),
        el("div", { role: "presentation" }),
        el("p", { role: "alert" }),
        el("div", { className: ["callout", "callout-evil", "callout-note"] }),
        el("span", { ariaHidden: "false" }),
        el("span", { ariaHidden: "true" }),
      ],
    };
    const out = rehypeSanitize(sanitizeSchema)(tree) as Root;
    const props = out.children.map((c) => (c as Element).properties);
    expect(props).toEqual([
      {},
      { role: "alert" },
      { role: "note" },
      {},
      {},
      { className: ["callout", "callout-note"] },
      {},
      { ariaHidden: "true" },
    ]);
  });
  it("C8: a plain blockquote stays a blockquote; a marker that is not on the first line makes no callout", () => {
    expect(html("> just a quote\n")).toBe("<blockquote>\n<p>just a quote</p>\n</blockquote>");
    const out = html("> quote\n> [!note] later\n");
    expect(out).toContain("<blockquote>");
    expect(out).not.toContain("callout");
    expect(html("> [not a marker]\n")).toContain("<blockquote>");
  });
  it("C8 / W3-4: a nested marker renders without error as a callout inside the outer one", () => {
    const out = html("> [!warning] Outer\n> text\n>\n> > [!tip] Inner\n> > inner body\n");
    expect(out).not.toContain("<blockquote");
    expect(out).toContain('<div class="callout callout-warning" role="alert">');
    expect(out).toContain(`<div class="callout callout-tip" role="note"><div class="callout-title">${ICON}Inner</div><p>inner body</p></div>`);
    // `> > [!note]` with no outer marker: the outer stays a blockquote, the inner is a callout.
    const plain = html("> > [!note] Only inner\n> > x\n");
    expect(plain).toContain("<blockquote>");
    expect(plain).toContain('<div class="callout callout-note" role="note">');
  });
  it("a Mermaid fence and a code block inside a callout body still become a placeholder and a block", () => {
    const out = html("> [!note] Both\n> ```mermaid\n> graph TD\n>   A-->B\n> ```\n>\n> ```ts\n> const x = 1;\n> ```\n");
    expect(out).toContain('class="callout callout-note"');
    expect(out.match(/data-mermaid-id=/g)).toHaveLength(1);
    expect(out).toContain('data-mermaid-source="graph TD\n  A--&gt;B"');
    expect(out).toContain("<pre");
    expect(out).toContain("const x = 1;");
    expect(out).not.toContain("language-mermaid");
  });
  it("does not mutate the shared AST", () => {
    const s = snapshotOf("> [!note] T\n> b\n");
    const before = JSON.stringify(s.pages.get("p.md")!.ast);
    renderPage(s, "p.md");
    expect(JSON.stringify(s.pages.get("p.md")!.ast)).toBe(before);
  });
});
