/**
 * Unit specs for `./wiki-path` (US-099 + US-100 + US-158 contract X4/X5; TC-428, TC-429, TC-436, TC-438).
 * Pure logic, no mocks. The page-level order and status specs are in `app/w/[wikiId]/[[...path]]/page.test.ts`.
 */
import { describe, expect, it } from "vitest";

import type { NavNode } from "@/content/runtime/types";

import { MAX_PATH_BYTES, bodyStartsWithH1, pageHref, pickLanding, requestedHref, resolveRequestedPath } from "./wiki-path";

const page = (path: string): NavNode => ({ kind: "page", name: path.split("/").pop()!, path, title: path });
const folder = (name: string, children: NavNode[]): NavNode => ({ kind: "folder", name, path: name, children });

describe("resolveRequestedPath (X4, TC-428): decode exactly once, then reject unsafe paths", () => {
  it("no path or an empty array is the landing request", () => {
    expect(resolveRequestedPath(undefined)).toEqual({ kind: "landing" });
    expect(resolveRequestedPath([])).toEqual({ kind: "landing" });
  });

  it.each([
    ["..", [".."]],
    [".", ["."]],
    ["an empty segment", [""]],
    ["an empty segment in the middle", ["a", "", "b"]],
    ["encoded dot-dot", ["%2e%2e"]],
    ["a%2Fb decoded to a/b", ["a%2Fb"]],
    ["a literal backslash", ["a\\b"]],
    ["an encoded backslash", ["a%5Cb"]],
    ["an encoded NUL", ["a%00b"]],
    ["a literal NUL", ["a\u0000b"]],
    ["an encoded BEL (U+0007)", ["a%07b"]],
    ["a literal BEL (U+0007)", ["a\u0007b"]],
    ["a malformed escape", ["%E0%A4%A"]],
    ["a dot-dot after a folder", ["docs", ".."]],
  ])("rejects %s", (_label, segments) => {
    expect(resolveRequestedPath(segments)).toEqual({ kind: "invalid" });
  });

  it("rejects a 1,025-byte joined path and does NOT reject a 1,024-byte one", () => {
    expect(MAX_PATH_BYTES).toBe(1024);
    expect(resolveRequestedPath(["a".repeat(1022) + ".md"])).toEqual({ kind: "invalid" }); // 1,025 bytes
    const atLimit = "a".repeat(1021) + ".md"; // 1,024 bytes
    expect(resolveRequestedPath([atLimit])).toEqual({ kind: "page", path: atLimit });
  });

  it("counts bytes, not characters", () => {
    // 513 two-byte characters = 1,026 bytes.
    expect(resolveRequestedPath(["é".repeat(513)])).toEqual({ kind: "invalid" });
  });
});

describe("resolveRequestedPath (S8, TC-429): the measured encoding, decoded exactly once", () => {
  // Measured 2026-09-29 on Next 16.3.5 (dev and the standalone build): for
  // `/w/<id>/docs/Setup%20Guide%252e.md` the page received `params.path === ["docs", "Setup%20Guide%252e.md"]`,
  // i.e. segments arrive percent-ENCODED and untouched. One decode here is therefore the only decode.
  it("`%252e%252e.md` becomes the file name `%2e%2e.md`, not `...md` or `..`", () => {
    expect(resolveRequestedPath(["%252e%252e.md"])).toEqual({ kind: "page", path: "%2e%2e.md" });
  });

  it("`%252e%252e` (no extension) is the name `%2e%2e`, never `..`", () => {
    expect(resolveRequestedPath(["%252e%252e"])).toEqual({ kind: "page", path: "%2e%2e" });
  });

  it("`docs/Setup%20Guide.md` is the page `docs/Setup Guide.md`", () => {
    expect(resolveRequestedPath(["docs", "Setup%20Guide.md"])).toEqual({ kind: "page", path: "docs/Setup Guide.md" });
  });

  it("decodes non-ASCII and reserved characters that the redirect encoder produces", () => {
    expect(resolveRequestedPath(["Guide%20%26%20Notes", "caf%C3%A9%20%231.md"])).toEqual({
      kind: "page",
      path: "Guide & Notes/café #1.md",
    });
  });
});

describe("pickLanding (S9, TC-436)", () => {
  const pages = (...paths: string[]) => new Set(paths);

  it("index.md beats README.md beats _index.md", () => {
    const all = ["README.md", "_index.md", "index.md"];
    expect(pickLanding(pages(...all), all.map(page))).toBe("index.md");
    expect(pickLanding(pages("README.md", "_index.md"), [page("README.md"), page("_index.md")])).toBe("README.md");
    expect(pickLanding(pages("_index.md", "a.md"), [page("_index.md"), page("a.md")])).toBe("_index.md");
  });

  it("an exact-case README.md beats readme.md, whatever the tree order", () => {
    expect(pickLanding(pages("readme.md", "README.md"), [page("readme.md"), page("README.md")])).toBe("README.md");
  });

  it("a case-insensitive match is used when no exact one exists; ties take the first in tree order", () => {
    expect(pickLanding(pages("Index.md"), [page("Index.md")])).toBe("Index.md");
    const tree = [page("Readme.md"), page("readme.md")];
    expect(pickLanding(pages("readme.md", "Readme.md"), tree)).toBe("Readme.md");
    expect(pickLanding(pages("readme.md", "Readme.md"), [...tree].reverse())).toBe("readme.md");
  });

  it("a root file beats docs/index.md, and a subfolder index is never a root landing", () => {
    const tree = [folder("docs", [page("docs/index.md")]), page("README.md")];
    expect(pickLanding(pages("docs/index.md", "README.md"), tree)).toBe("README.md");
    // No root candidate: the first page depth-first, which here happens to be docs/index.md by tree order, not by rule.
    const noRoot = [folder("docs", [page("docs/a.md"), page("docs/index.md")]), page("z.md")];
    expect(pickLanding(pages("docs/index.md", "docs/a.md", "z.md"), noRoot)).toBe("docs/a.md");
  });

  it("with no root index the first tree page depth-first is used (folders first)", () => {
    const tree = [folder("guides", [folder("deep", [page("guides/deep/x.md")]), page("guides/g.md")]), page("a.md")];
    expect(pickLanding(pages("guides/deep/x.md", "guides/g.md", "a.md"), tree)).toBe("guides/deep/x.md");
  });

  it("an empty wiki has no landing", () => {
    expect(pickLanding(pages(), [])).toBeNull();
  });
});

describe("pageHref (S9): the redirect target is encoded per segment and stable", () => {
  it("encodes each segment and keeps the slashes", () => {
    const href = pageHref("6abc", "Guide & Notes/café #1.md");
    expect(href).toBe("/w/6abc/Guide%20%26%20Notes/caf%C3%A9%20%231.md");
    expect(pageHref("6abc", "Guide & Notes/café #1.md")).toBe(href);
  });

  it("round-trips through resolveRequestedPath", () => {
    const path = "a b/100% #?&=+.md";
    const segments = pageHref("id", path).split("/").slice(3);
    expect(resolveRequestedPath(segments)).toEqual({ kind: "page", path });
  });
});

describe("bodyStartsWithH1 (X8)", () => {
  const root = (...children: unknown[]) => ({ type: "root", children }) as never;

  it("is true when the first non-front-matter node is an h1", () => {
    expect(bodyStartsWithH1(root({ type: "yaml", value: "title: x" }, { type: "heading", depth: 1, children: [] }))).toBe(
      true,
    );
  });

  it("is false for an h2 first, a paragraph first, or an empty body", () => {
    expect(bodyStartsWithH1(root({ type: "heading", depth: 2, children: [] }))).toBe(false);
    expect(bodyStartsWithH1(root({ type: "paragraph", children: [] }, { type: "heading", depth: 1, children: [] }))).toBe(
      false,
    );
    expect(bodyStartsWithH1(root())).toBe(false);
  });
});

describe("requestedHref (US-102, Y8-4): the retry target is the URL the viewer asked for", () => {
  it("the landing request is the bare /w/{id}", () => {
    expect(requestedHref("6abc", resolveRequestedPath(undefined) as never)).toBe("/w/6abc");
  });

  it.each([
    [["docs", "guide.md"], "/w/6abc/docs/guide.md"],
    [["docs", "Setup%20Guide.md"], "/w/6abc/docs/Setup%20Guide.md"],
    [["a%23b.md"], "/w/6abc/a%23b.md"],
    [["%252e%252e.md"], "/w/6abc/%252e%252e.md"],
  ])("%j round-trips to %s", (segments, expected) => {
    const requested = resolveRequestedPath(segments);
    expect(requested.kind).toBe("page");
    expect(requestedHref("6abc", requested as never)).toBe(expected);
  });
});
