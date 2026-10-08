/**
 * Component specs for `./nav-tree` (US-097 contract S1-S6, S8; rulings N1-N2). `renderToStaticMarkup` with the
 * REAL `messages/en.json`; no DOM library, so the markup is read with small regex helpers.
 */
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import messages from "../../../messages/en.json";
import { parsePages } from "@/content/render/parse";
import { buildTree } from "@/content/runtime/tree";
import type { FileEntry, NavNode } from "@/content/runtime/types";
import { createLocalSource } from "@/content/runtime/local-source";

import { NAV_LINK_CLASS, NAV_NESTED_LIST_CLASS, NavTree, type NavTreeProps } from "./nav-tree";
import { resolveRequestedPath } from "./wiki-path";

const WIKI = "6abc14b04a924c5ba918f4ff";

const page = (path: string, title = path): NavNode => ({ kind: "page", name: path.split("/").pop()!.replace(/\.md$/, ""), path, title });
const folder = (path: string, children: NavNode[]): NavNode => ({ kind: "folder", name: path.split("/").pop()!, path, children });

function render(tree: NavNode[], activePath: string | null = null): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages,
      children: createElement(NavTree, { wikiId: WIKI, tree, activePath }),
    }),
  );
}

/** `[openFlag, summaryText]` per `<details>`, in document order. */
function folders(out: string): Array<{ open: boolean; name: string }> {
  return [...out.matchAll(/<details([^>]*)><summary[^>]*>(?:<svg[^>]*>.*?<\/svg>)?([^<]*)<\/summary>/g)].map((m) => ({
    open: / open(=|\s|$)/.test(m[1]!),
    name: m[2]!,
  }));
}

/** `{href, current, text}` per link, in document order. */
function links(out: string): Array<{ href: string; current: boolean; text: string }> {
  return [...out.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => ({
    href: /href="([^"]*)"/.exec(m[1]!)![1]!,
    current: m[1]!.includes('aria-current="page"'),
    text: m[2]!,
  }));
}

/** Deepest `<ul>` nesting reached anywhere in the markup. */
function maxUlDepth(out: string): number {
  let depth = 0;
  let max = 0;
  for (const m of out.matchAll(/<(\/?)ul[ >]/g)) {
    depth += m[1] === "/" ? -1 : 1;
    max = Math.max(max, depth);
  }
  return max;
}

describe("S1 (sc.1): the tree is rendered with the same nesting, every page once", () => {
  const tree = [
    folder("a", [folder("a/b", [page("a/b/c.md", "C")]), page("a/x.md", "X")]),
    page("top.md", "Top"),
  ];

  it("the ul depth equals the folder depth plus the root list, and each page link appears once", () => {
    const out = render(tree);
    expect(maxUlDepth(out)).toBe(3);
    expect(links(out).map((l) => l.text)).toEqual(["C", "X", "Top"]);
    expect(folders(out).map((f) => f.name)).toEqual(["a", "b"]);
  });

  it("the landmark is a nav labelled 'Wiki pages' (N4, R-12)", () => {
    expect(render(tree)).toMatch(/^<nav aria-label="Wiki pages"/);
  });

  it("a page with an empty title shows its name (N1)", () => {
    expect(links(render([page("docs/guide.md", "")])).map((l) => l.text)).toEqual(["guide"]);
  });

  it("there is no script and no client marker", () => {
    expect(render(tree)).not.toMatch(/<script|<button/);
  });
});

describe("F1: depth and the current page are visible (structural pin)", () => {
  it("a nested ul carries the indent classes, the root does not, and the active link carries the aria-current variants", () => {
    const out = render([folder("a", [page("a/b.md", "B")])], "a/b.md");
    const uls = [...out.matchAll(/<ul class="([^"]*)"/g)].map((m) => m[1]!);
    expect(uls).toHaveLength(2);
    expect(uls[1]).toBe(NAV_NESTED_LIST_CLASS);
    expect(uls[0]).not.toBe(NAV_NESTED_LIST_CLASS);
    expect(NAV_NESTED_LIST_CLASS).toMatch(/\bml-\d+\b.*\bpl-\d+\b|\bpl-\d+\b.*\bml-\d+\b/);
    expect(NAV_LINK_CLASS).toContain("aria-[current=page]:font-bold");
    expect(NAV_LINK_CLASS).toContain("aria-[current=page]:bg-surface-selected");
    expect(out).toContain(`class="${NAV_LINK_CLASS}"`);
  });
});

describe("S2 (sc.2, DEC-006): nothing is hidden by name", () => {
  it("(a) meta/ and .private/ folders given as nodes are rendered", () => {
    const out = render([folder(".private", [page(".private/secret.md", "Secret")]), folder("meta", [page("meta/notes.md", "Notes")])]);
    expect(folders(out).map((f) => f.name)).toEqual([".private", "meta"]);
    expect(links(out).map((l) => l.text)).toEqual(["Secret", "Notes"]);
  });

  it("(b) through the real local source -> parsePages -> buildTree both folders survive", async () => {
    const root = await mkdtemp(join(tmpdir(), "wr-nav-"));
    const add = async (name: string, body: string) => {
      await mkdir(dirname(join(root, name)), { recursive: true });
      await writeFile(join(root, name), body);
    };
    await add("README.md", "# Home\n");
    await add("meta/notes.md", "# Notes\n");
    await add(".private/secret.md", "# Secret\n");
    await add(".obsidian/workspace.md", "# Not content\n");

    const source = createLocalSource(root, 1_000_000);
    const fileTree = await source.fetchTree(await source.getLatestSha());
    const files = new Map<string, FileEntry>(
      [...fileTree.files].map(([path, bytes]) => [path, { bytes, contentType: "text/markdown; charset=utf-8" }]),
    );
    const tree = buildTree(parsePages(files));

    expect(tree.filter((n) => n.kind === "folder").map((n) => n.name)).toEqual([".private", "meta"]);
    const out = render(tree);
    expect(folders(out).map((f) => f.name)).toEqual([".private", "meta"]);
    expect(links(out).map((l) => l.href)).toEqual([
      `/w/${WIKI}/.private/secret.md`,
      `/w/${WIKI}/meta/notes.md`,
      `/w/${WIKI}/README.md`,
    ]);
  });
});

describe("S3 (sc.3): NavTree has no session or access input", () => {
  it("its props are exactly { wikiId, tree, activePath }", () => {
    expectTypeOf<NavTreeProps>().toEqualTypeOf<{ wikiId: string; tree: NavNode[]; activePath: string | null }>();
    expect(NavTree.length).toBe(1);
  });
});

describe("S4 (N1): only the active path is open, and only the active page is current", () => {
  const tree = [
    folder("a", [folder("a/b", [page("a/b/c.md", "C"), page("a/b/d.md", "D")]), folder("a/e", [page("a/e/f.md", "F")]), page("a/g.md", "G")]),
    folder("z", [page("z/y.md", "Y")]),
    page("a.md", "A"),
  ];

  it("a/ and a/b/ are open; a/e/ and z/ are closed; only c.md is current", () => {
    const out = render(tree, "a/b/c.md");
    expect(folders(out)).toEqual([
      { name: "a", open: true },
      { name: "b", open: true },
      { name: "e", open: false },
      { name: "z", open: false },
    ]);
    expect(links(out).filter((l) => l.current).map((l) => l.text)).toEqual(["C"]);
  });

  it("a root page opens nothing, and a folder whose name is a prefix of the active folder stays closed", () => {
    expect(folders(render(tree, "a.md")).every((f) => !f.open)).toBe(true);
    const prefixTree = [folder("doc", [page("doc/x.md")]), folder("docs", [page("docs/y.md")])];
    expect(folders(render(prefixTree, "docs/y.md"))).toEqual([
      { name: "doc", open: false },
      { name: "docs", open: true },
    ]);
  });

  it("a null active path (the empty view) opens nothing and marks nothing current", () => {
    const out = render(tree, null);
    expect(folders(out).every((f) => !f.open)).toBe(true);
    expect(out).not.toContain("aria-current");
  });
});

describe("S5 (TC-434): hrefs round-trip names that need URL encoding", () => {
  const names = ["a b", "a#b", "a%b", "a?b", "a&b", "é", "café #1", "100%25", "%2e%2e"];

  it("each node href, fed back through resolveRequestedPath, yields the original path", () => {
    const tree = names.map((n) => folder(n, [page(`${n}/${n}.md`, n)]));
    const out = render(tree);
    const found = links(out);
    expect(found).toHaveLength(names.length);
    for (const [i, link] of found.entries()) {
      expect(link.href).not.toMatch(/[#?]/);
      const segments = link.href.slice(`/w/${WIKI}/`.length).split("/");
      expect(resolveRequestedPath(segments)).toEqual({ kind: "page", path: `${names[i]}/${names[i]}.md` });
    }
  });
});

describe("S6 (TC-435): deep and wide trees render without error", () => {
  it("50 folders deep: one link, 50 nested details", () => {
    let node: NavNode = page(`${Array.from({ length: 50 }, (_, i) => `d${i}`).join("/")}/leaf.md`, "Leaf");
    for (let depth = 50; depth >= 1; depth--) {
      node = folder(Array.from({ length: depth }, (_, i) => `d${i}`).join("/"), [node]);
    }
    const out = render([node]);
    expect(links(out)).toHaveLength(1);
    expect(folders(out)).toHaveLength(50);
    expect(maxUlDepth(out)).toBe(51);
  });

  it("2,000 flat pages: 2,000 links", () => {
    const tree = Array.from({ length: 2000 }, (_, i) => page(`p${i}.md`, `P${i}`));
    expect(links(render(tree))).toHaveLength(2000);
  });
});

describe("S8 (N2): the output order is the input order, no re-sort", () => {
  it("an input deliberately not in Y4 order is emitted as given", () => {
    const tree = [page("z.md", "Z"), folder("m", [page("m/b.md", "B"), page("m/a.md", "A")]), page("b.md", "B2"), folder("a", [page("a/q.md", "Q")])];
    const out = render(tree);
    expect(links(out).map((l) => l.text)).toEqual(["Z", "B", "A", "B2", "Q"]);
    expect(folders(out).map((f) => f.name)).toEqual(["m", "a"]);
  });
});

describe("US-187: the tree adds no client script", () => {
  const source = readFileSync(fileURLToPath(new URL("./nav-tree.tsx", import.meta.url)), "utf8");

  it("nav-tree.tsx is a server component: no 'use client' directive", () => {
    expect(source).not.toMatch(/^\s*["']use client["']/m);
  });

  it("it imports only server-safe modules: next/link, next-intl, lucide-react icons, types, the pure wiki-path and the render-nothing NavScroll island (US-219)", () => {
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]!);
    expect(imports.sort()).toEqual(["./nav-scroll", "./wiki-path", "@/content/runtime/types", "lucide-react", "next-intl", "next/link", "react"].sort());
  });

  it("it uses no hook and no handler: nothing that would need the client", () => {
    expect(source).not.toMatch(/\buse(State|Effect|Ref|Reducer|Callback|Memo)\b|\bon[A-Z][A-Za-z]*=\{/);
  });
});

describe("US-219: the tree scrolls to the current page", () => {
  const source = readFileSync(fileURLToPath(new URL("./nav-tree.tsx", import.meta.url)), "utf8");

  it("mounts NavScroll once, inside the nav, keyed on the active path, and it adds no markup", () => {
    expect(source.match(/<NavScroll /g)).toHaveLength(1);
    expect(source).toMatch(/<NavScroll activePath=\{activePath\} \/>\s*<\/nav>/);
    const out = render([page("a.md", "A")], "a.md");
    expect(out).toMatch(/^<nav[^>]*data-testid="reader-nav"[^>]*><ul[\s\S]*<\/ul><\/nav>$/);
  });
});

describe("US-219: NavScroll moves only the nav's own scrollTop", () => {
  const source = readFileSync(fileURLToPath(new URL("./nav-scroll.tsx", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");

  it("never calls scrollIntoView or scrollTo, never touches the window's scroll, and fires on the active path", () => {
    expect(code).not.toMatch(/scrollIntoView|scrollTo\b|scrollBy|window\.scroll|behavior/);
    expect(code).toMatch(/nav\.scrollTop = next/);
    expect(code).toMatch(/\[activePath\]\);/);
  });
});
