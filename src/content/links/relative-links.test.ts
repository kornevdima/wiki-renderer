/**
 * S06 wave 7 resolver specs: US-085 (R1 to R4 resolver half; TC-221, TC-222, TC-455) and the asset URL builder
 * (US-105, W7-5). Through `parsePages` -> `buildLinkMap` -> `resolveRelativeLink` / `resolveExternalLink`. The rendered
 * half is `render/links.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { parsePages } from "@/content/render/parse";
import type { FileEntry } from "@/content/runtime/types";
import { ASSET_API_PREFIX, ASSET_SEGMENT, assetContentType, assetUrl, isAssetPath } from "./asset-url";
import { buildLinkMap } from "./link-map";
import { guardRelativeTarget, hrefScheme, isProtocolRelative } from "./path-guard";
import { resolveExternalLink, resolveRelativeLink } from "./resolve";
import type { LinkMap } from "./types";

const enc = new TextEncoder();
function mapOf(entries: Record<string, string>): LinkMap {
  const files = new Map<string, FileEntry>(Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]));
  return buildLinkMap(parsePages(files), files, "w", "s");
}

/** Every key any index of the map is asked for, in order: the R3 spy ("no lookup is attempted"). */
class SpyMap<V> extends Map<string, V> {
  constructor(
    source: ReadonlyMap<string, V>,
    private readonly log: string[],
  ) {
    super(source);
  }
  override get(key: string): V | undefined {
    this.log.push(key);
    return super.get(key);
  }
  override has(key: string): boolean {
    this.log.push(key);
    return super.has(key);
  }
}
function spied(map: LinkMap): { map: LinkMap; lookups: string[] } {
  const lookups: string[] = [];
  const wrap = <V>(m: ReadonlyMap<string, V>) => new SpyMap<V>(m, lookups);
  return {
    lookups,
    map: {
      ...map,
      basenameIndexFolded: wrap(map.basenameIndexFolded),
      assetBasenameIndex: wrap(map.assetBasenameIndex),
      pathIndex: wrap(map.pathIndex),
      pathIndexNfc: wrap(map.pathIndexNfc),
      aliasIndex: wrap(map.aliasIndex),
      headingIndex: wrap(map.headingIndex),
    },
  };
}

const TRAVERSAL = { kind: "unavailable", reason: "traversal-rejected" };
const NOT_FOUND = { kind: "unavailable", reason: "not-found" };

const VAULT = {
  "wiki/x/y.md": "# Y",
  "AGENTS.md": "# Agents",
  ".raw/x.md": "# Raw",
  "wiki/sources/a.md": "# A",
  "wiki/sources/b.md": "# B\n\n## Setup\n\n## Install Steps\n",
  "wiki/sources/My Page.md": "# My Page",
  "wiki/sources/pic.png": "png",
  "wiki/sources/doc.pdf": "pdf",
  "guides/setup.md": "# Setup\n\n## Install\n",
  "docs/a.md": "# A",
  // A file that exists where a clamped traversal would land: if the root check is removed, `../../../etc/passwd` finds it.
  "etc/passwd": "root:x:0:0",
  "wiki/etc/passwd": "root:x:0:0",
};
const map = mapOf(VAULT);
const r = (from: string, href: string) => resolveRelativeLink(map, from, href);
const page = (path: string, heading?: { slug?: string; matched: boolean }) => ({ kind: "page", path, ...(heading ? { heading } : {}) });

describe("R1: a relative link resolves against the folder of the page", () => {
  it("../guides/setup.md from docs/a.md is guides/setup.md", () => {
    expect(r("docs/a.md", "../guides/setup.md")).toEqual(page("guides/setup.md"));
  });
  it("a bare file name is this folder's file, by PATH, never by basename elsewhere", () => {
    expect(r("wiki/sources/a.md", "b.md")).toEqual(page("wiki/sources/b.md"));
    expect(r("wiki/sources/a.md", "./b.md")).toEqual(page("wiki/sources/b.md"));
    // `setup.md` exists in guides/, not in docs/: a relative link never falls back to a basename match.
    expect(r("docs/a.md", "setup.md")).toEqual(NOT_FOUND);
  });
  it("the .md may be left off, as a page path", () => {
    expect(r("wiki/sources/a.md", "b")).toEqual(page("wiki/sources/b.md"));
  });
});

describe("R2 (TC-455): the accepted forms", () => {
  it("1, 2: a `..` that stays inside the repository resolves, up to the root", () => {
    expect(r("wiki/sources/a.md", "../../.raw/x.md")).toEqual(page(".raw/x.md"));
    expect(r("wiki/sources/a.md", "../../AGENTS.md")).toEqual(page("AGENTS.md"));
  });
  it("3: a heading fragment resolves to the heading's slug when the page has it; the slug of the text when it is spelled as text", () => {
    expect(r("wiki/sources/a.md", "b.md#setup")).toEqual(page("wiki/sources/b.md", { slug: "setup", matched: true }));
    expect(r("wiki/sources/a.md", "b.md#Install%20Steps")).toEqual(page("wiki/sources/b.md", { slug: "install-steps", matched: true }));
    expect(r("docs/a.md", "../guides/setup.md#install")).toEqual(page("guides/setup.md", { slug: "install", matched: true }));
  });
  it("3: a fragment the page does not have is a partial match, never unavailable", () => {
    expect(r("wiki/sources/a.md", "b.md#nope")).toEqual(page("wiki/sources/b.md", { matched: false }));
  });
  it("4: a query is dropped, by one rule, and never reaches a lookup", () => {
    expect(r("wiki/sources/a.md", "b.md?x=1")).toEqual(page("wiki/sources/b.md"));
    expect(r("wiki/sources/a.md", "b.md?x=1#setup")).toEqual(page("wiki/sources/b.md", { slug: "setup", matched: true }));
    const s = spied(map);
    resolveRelativeLink(s.map, "wiki/sources/a.md", "b.md?x=1#setup");
    expect(s.lookups.some((key) => /[?#]/.test(key))).toBe(false);
  });
  it("5: %20 names resolve after exactly one decode", () => {
    expect(r("wiki/sources/a.md", "My%20Page.md")).toEqual(page("wiki/sources/My Page.md"));
  });
  it("9: a relative link to a non-page file that exists is an asset (the caller draws or refuses it by type)", () => {
    expect(r("wiki/sources/a.md", "pic.png")).toEqual({ kind: "asset", path: "wiki/sources/pic.png" });
    expect(r("wiki/sources/a.md", "doc.pdf")).toEqual({ kind: "asset", path: "wiki/sources/doc.pdf" });
  });
  it("8, 10: outside the root is traversal-rejected; a missing target is not-found", () => {
    expect(r("wiki/sources/a.md", "../../../outside.md")).toEqual(TRAVERSAL);
    expect(r("wiki/sources/a.md", "missing.md")).toEqual(NOT_FOUND);
  });
  it("11, 12, 13: an empty fragment is the page; an empty target and a bare `#` link to no other page and do not throw", () => {
    expect(r("wiki/sources/a.md", "b.md#")).toEqual(page("wiki/sources/b.md"));
    expect(r("wiki/sources/a.md", "")).toEqual(TRAVERSAL);
    expect(r("wiki/sources/a.md", "#")).toEqual(TRAVERSAL);
    expect(r("wiki/sources/a.md", "?x=1")).toEqual(TRAVERSAL);
  });
  it("a malformed escape is refused, not thrown", () => {
    expect(() => r("wiki/sources/a.md", "%E0%A4%A.md")).not.toThrow();
    expect(r("wiki/sources/a.md", "%E0%A4%A.md")).toEqual(TRAVERSAL);
  });
});

describe("R3 (TC-221, SR-010): traversal is refused before any lookup", () => {
  const cases: [string, string][] = [
    ["../../../etc/passwd (above the root)", "../../../etc/passwd"],
    ["/etc/passwd (absolute)", "/etc/passwd"],
    ["%2e%2e/ (encoded dots)", "%2e%2e/%2e%2e/%2e%2e/etc/passwd"],
    ["..%2f (encoded slash)", "..%2f..%2f..%2fetc%2fpasswd"],
    ["double-encoded", "%252e%252e%252f%252e%252e%252fetc%252fpasswd"],
    ["backslash", "..\\..\\..\\etc\\passwd"],
    ["a backslash inside an otherwise fine path", "sources\\a.md"],
    ["NUL", "a.md\u0000.png"],
    ["encoded NUL", "a.md%00.png"],
    ["a control character", "a\u0001.md"],
    ["an encoded absolute path", "%2fetc%2fpasswd"],
    ["over 1,024 bytes", `${"a/".repeat(600)}x.md`],
  ];
  for (const [name, href] of cases) {
    it(`${name} is traversal-rejected and no index is consulted`, () => {
      const s = spied(map);
      expect(resolveRelativeLink(s.map, "wiki/x/y.md", href)).toEqual(TRAVERSAL);
      expect(s.lookups).toEqual([]);
    });
  }
  it("TC-221 from guides/setup.md: the three literal rows", () => {
    for (const href of ["/etc/passwd", "..%2f..%2f..%2fetc%2fpasswd", "..\\..\\..\\etc\\passwd"]) {
      const s = spied(map);
      expect(resolveRelativeLink(s.map, "guides/setup.md", href)).toEqual(TRAVERSAL);
      expect(s.lookups).toEqual([]);
    }
  });
  it("../../AGENTS.md from wiki/x/y.md resolves (this vault's own links climb to the repository root)", () => {
    expect(r("wiki/x/y.md", "../../AGENTS.md")).toEqual(page("AGENTS.md"));
  });
  it("a `..` that lands exactly at the root and names nothing is refused, not a lookup of the empty path", () => {
    const s = spied(map);
    expect(resolveRelativeLink(s.map, "a/b.md", "..")).toEqual(TRAVERSAL);
    expect(s.lookups).toEqual([]);
  });
});

describe("the path guard itself", () => {
  it("returns the repository path and the once-decoded fragment", () => {
    expect(guardRelativeTarget("a/b.md", "../c/d.md#Some%20Head")).toEqual({ ok: true, path: "c/d.md", fragment: "Some Head" });
    expect(guardRelativeTarget("a.md", "x%2Fy.md")).toEqual({ ok: true, path: "x/y.md", fragment: undefined });
  });
  it("climbing to exactly the root is allowed when something is named", () => {
    expect(guardRelativeTarget("a/b/c.md", "../../d.md")).toEqual({ ok: true, path: "d.md", fragment: undefined });
    expect(guardRelativeTarget("a/b/c.md", "../../../d.md")).toEqual({ ok: false });
  });
});

describe("R4 (TC-222) and the schemes", () => {
  it("a protocol-relative link is EXTERNAL (written as https), never internal; the backslash spellings too", () => {
    expect(resolveExternalLink("//evil.example/x")).toEqual({ kind: "external", href: "https://evil.example/x" });
    expect(resolveExternalLink("\\\\evil.example/x")).toEqual({ kind: "external", href: "https://evil.example/x" });
    expect(resolveExternalLink("/\\evil.example/x")).toEqual({ kind: "external", href: "https://evil.example/x" });
    expect(isProtocolRelative("//x")).toBe(true);
    expect(isProtocolRelative("/x")).toBe(false);
    expect(isProtocolRelative("x//y")).toBe(false);
  });
  it("http, https and mailto are external", () => {
    expect(resolveExternalLink("https://example.com/a?b#c")).toEqual({ kind: "external", href: "https://example.com/a?b#c" });
    expect(resolveExternalLink("HTTP://example.com")).toEqual({ kind: "external", href: "http://example.com" });
    expect(resolveExternalLink("mailto:a@b.test")).toEqual({ kind: "external", href: "mailto:a@b.test" });
  });
  it("an uppercase scheme is classified and emitted lower-cased; a blocked scheme stays blocked in any case", () => {
    expect(resolveExternalLink("HTTPS://x.com/A")).toEqual({ kind: "external", href: "https://x.com/A" });
    expect(resolveExternalLink("Https://x.com")).toEqual({ kind: "external", href: "https://x.com" });
    expect(resolveExternalLink("MAILTO:a@B.test")).toEqual({ kind: "external", href: "mailto:a@B.test" });
    expect(resolveExternalLink("JAVASCRIPT:alert(1)").kind).toBe("blocked");
  });
  it("javascript, data, vbscript and every other scheme are blocked, whatever the case, whitespace or control characters", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "\tjava\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html;base64,AAAA",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://x.example/f",
      "tel:123",
    ]) {
      expect(resolveExternalLink(href).kind, href).toBe("blocked");
    }
  });
  it("hrefScheme reads the scheme the way a browser does, and finds none in a relative path", () => {
    expect(hrefScheme(" \tJaVa\nScript:x")).toBe("javascript");
    expect(hrefScheme("docs/a.md")).toBeUndefined();
    expect(hrefScheme("a.md#x:y")).toBeUndefined();
    expect(hrefScheme("./a:b.md")).toBeUndefined();
  });
});

describe("assetUrl (W7-5, S6-L4): the one builder of the asset URL", () => {
  it("is /api/wikis/{wikiId}/asset/{sha}/{path...} with each segment encoded once", () => {
    expect(assetUrl("w1", "abc123", "assets/pixel.png")).toBe("/api/wikis/w1/asset/abc123/assets/pixel.png");
    expect(assetUrl("w/1", "s h", "a b/c#d%e.png")).toBe("/api/wikis/w%2F1/asset/s%20h/a%20b/c%23d%25e.png");
  });
  it("names the route folder through the shared constants", () => {
    expect(ASSET_API_PREFIX).toBe("/api/wikis");
    expect(ASSET_SEGMENT).toBe("asset");
  });
  it("the image allowlist is by extension, case-insensitively, and nothing else", () => {
    for (const [path, type] of [
      ["a.png", "image/png"],
      ["A.PNG", "image/png"],
      ["d/a.jpg", "image/jpeg"],
      ["a.jpeg", "image/jpeg"],
      ["a.gif", "image/gif"],
      ["a.webp", "image/webp"],
      ["a.svg", "image/svg+xml"],
    ] as const) {
      expect(assetContentType(path), path).toBe(type);
    }
    for (const path of ["a.md", "a.pdf", "a.html", "a.txt", "a.json", "noext", "png", ".png.md", "a.png.html", "dir.png/file", "__proto__", "a.constructor"]) {
      expect(assetContentType(path), path).toBeUndefined();
    }
  });
});

describe("isAssetPath: the proxy steps aside only for the asset route", () => {
  it("matches what assetUrl builds, and nothing else", () => {
    expect(isAssetPath(assetUrl("w1", "abc", "a/b.png"))).toBe(true);
    expect(isAssetPath("/api/wikis/w1/asset/abc/x.png")).toBe(true);
    for (const path of [
      "/api/wikis/w1/asset",
      "/api/wikis//asset/abc/x.png",
      "/api/wikis/w1/search-index/abc",
      "/api/wikis/w1/assets/abc/x.png",
      "/api/health",
      "/w/w1/asset/abc/x.png",
      "/x/api/wikis/w1/asset/abc/x.png",
      "/",
    ]) {
      expect(isAssetPath(path), path).toBe(false);
    }
  });
});
