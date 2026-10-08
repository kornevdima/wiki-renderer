import { emptyLinkMap } from "@/content/links/link-map.testing";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { MAX_DEPTH, MAX_ITEMS, MAX_NODES, MAX_STRING, TRUNCATED } from "./frontmatter-view";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import type { RenderedPage } from "./types";

const enc = new TextEncoder();
function page(text: string): RenderedPage {
  const files = new Map<string, FileEntry>([["p.md", { bytes: enc.encode(text), contentType: "text/markdown" }]]);
  const snap: WikiSnapshot = { wikiId: "w", sha: "abc", files, pages: parsePages(files), linkMap: emptyLinkMap(), searchIndexJson: "", tree: [] };
  const r = renderPage(snap, "p.md");
  if ("state" in r) throw new Error("unavailable");
  return r;
}

beforeEach(() => resetRenderCacheForTests());

describe("frontmatterView: US-071 F1-F3", () => {
  it("F1: every top-level key in source order, none hidden, last duplicate wins, no raw block in the body", () => {
    const p = page("---\nz: 1\ntitle: T\naliases: [a, b]\nstatus: draft\nz: 2\n---\nbody\n");
    expect(p.frontmatterView).toEqual([
      { key: "z", value: 2 },
      { key: "title", value: "T" },
      { key: "aliases", value: ["a", "b"] },
      { key: "status", value: "draft" },
    ]);
    const out = renderToStaticMarkup(p.content);
    expect(out).not.toContain("---");
    expect(out).not.toContain("draft");
  });
  it("F2: no frontmatter gives [] without error", () => {
    expect(page("# Only body\n").frontmatterView).toEqual([]);
  });
  it("F3: an unrecognised custom key is included", () => {
    expect(page("---\nx-custom-thing: yes-ish\n---\n").frontmatterView).toEqual([{ key: "x-custom-thing", value: "yes-ish" }]);
  });
});

describe("frontmatterView: TC-202 malformed, TC-203 structure (F4, F5)", () => {
  it("F4: malformed YAML gives [] and the page still renders", () => {
    const p = page("---\nkey: [unclosed\n  : : :\n---\n# Still here\n");
    expect(p.frontmatterView).toEqual([]);
    expect(renderToStaticMarkup(p.content)).toContain("Still here");
  });
  it("F5: a list or map value is a nested structure, not a string dump", () => {
    const p = page("---\ntags: [a, b]\nmeta:\n  owner: me\n  deep:\n    n: 1\n---\n");
    expect(p.frontmatterView).toEqual([
      { key: "tags", value: ["a", "b"] },
      { key: "meta", value: { owner: "me", deep: { n: 1 } } },
    ]);
    expect(typeof p.frontmatterView[0]!.value).toBe("object");
  });
  it("keeps null as null", () => {
    expect(page("---\nempty:\n---\n").frontmatterView).toEqual([{ key: "empty", value: null }]);
  });
});

describe("frontmatterView: TC-463 bounds and inertness (F6)", () => {
  it("F6: a string is cut at 2,000 characters and marked", () => {
    const p = page(`---\nlong: ${"x".repeat(MAX_STRING + 50)}\nfit: ${"y".repeat(MAX_STRING)}\n---\n`);
    const [long, fit] = p.frontmatterView.map((f) => f.value as string);
    expect(long).toBe(`${"x".repeat(MAX_STRING)} ${TRUNCATED}`);
    expect(fit).toBe("y".repeat(MAX_STRING));
  });
  it("F6: a list is cut at 100 items and marked", () => {
    const items = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => i).join(", ");
    const value = page(`---\nl: [${items}]\n---\n`).frontmatterView[0]!.value as unknown[];
    expect(value).toHaveLength(MAX_ITEMS + 1);
    expect(value[MAX_ITEMS - 1]).toBe(MAX_ITEMS - 1);
    expect(value[MAX_ITEMS]).toBe(TRUNCATED);
  });
  it("F6: nesting stops at depth 5 and is marked", () => {
    const value = page("---\na:\n  b:\n    c:\n      d:\n        e:\n          f:\n            g: deep\n---\n").frontmatterView[0]!.value;
    // a's value is depth 1; e's value (depth 5) is the last container kept; f's value would be depth 6.
    expect(value).toEqual({ b: { c: { d: { e: { f: TRUNCATED } } } } });
    expect(MAX_DEPTH).toBe(5);
  });
  it("F6: hostile keys and values stay plain data and never reach the body as markup", () => {
    const p = page('---\n"<img src=x onerror=alert(1)>": "<script>alert(1)</script>"\n__proto__: polluted\n---\nbody\n');
    expect(p.frontmatterView[0]).toEqual({ key: "<img src=x onerror=alert(1)>", value: "<script>alert(1)</script>" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const out = renderToStaticMarkup(p.content);
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
  });
  it("caps the total field nodes so an alias fan-out cannot bloat the view", () => {
    const rows = ["a0: &a0 [1, 2, 3]", ...Array.from({ length: 30 }, (_, i) => `a${i + 1}: &a${i + 1} [*a${i}, *a${i}, *a${i}, *a${i}]`)];
    const p = page(`---\n${rows.join("\n")}\n---\n`);
    const count = (v: unknown): number => (Array.isArray(v) ? 1 + v.reduce<number>((n, x) => n + count(x), 0) : 1);
    expect(p.frontmatterView.reduce((n, f) => n + count(f.value), 0)).toBeLessThanOrEqual(MAX_NODES + p.frontmatterView.length + 2000);
  });
  it("cuts a key at 2,000 characters and marks it", () => {
    const p = page(`---\n? ${"k".repeat(MAX_STRING + 10)}\n: v\n---\n`);
    expect(p.frontmatterView[0]!.key).toBe(`${"k".repeat(MAX_STRING)} ${TRUNCATED}`);
  });
  it("caps top-level keys at 100 with a (truncated) key", () => {
    const rows = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => `k${i}: ${i}`).join("\n");
    const view = page(`---\n${rows}\n---\n`).frontmatterView;
    expect(view).toHaveLength(MAX_ITEMS + 1);
    expect(view[MAX_ITEMS - 1]).toEqual({ key: `k${MAX_ITEMS - 1}`, value: MAX_ITEMS - 1 });
    expect(view[MAX_ITEMS]).toEqual({ key: TRUNCATED, value: TRUNCATED });
  });
});
