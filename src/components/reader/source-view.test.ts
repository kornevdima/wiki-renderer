/** US-161 pure logic: the view selector, URL builders, text decoding and the download's Content-Disposition. */
import { describe, expect, it } from "vitest";
import {
  decodeSource,
  isSourceView,
  sourceBasename,
  sourceContentDisposition,
  sourceDownloadUrl,
  sourceViewHref,
} from "./source-view";

describe("isSourceView (D1)", () => {
  it("is true only for exactly ?view=source", () => {
    expect(isSourceView("source")).toBe(true);
    for (const v of [undefined, "", "Source", "page", "source ", ["source"], ["source", "source"]]) {
      expect(isSourceView(v), String(v)).toBe(false);
    }
  });
});

describe("URL builders", () => {
  it("the source view href is the page's canonical href plus ?view=source", () => {
    expect(sourceViewHref("w1", "a b/Ü.md")).toBe("/w/w1/a%20b/%C3%9C.md?view=source");
  });
  it("the download URL encodes every segment and names the route's folder", () => {
    expect(sourceDownloadUrl("w1", "abc", "a b/Ü #.md")).toBe("/api/wikis/w1/source/abc/a%20b/%C3%9C%20%23.md");
  });
});

describe("decodeSource", () => {
  it("is the UTF-8 text with CRLF, comments and frontmatter intact", () => {
    const src = "---\r\ntitle: T\r\n---\r\n%%c%%\r\n<!-- h -->\r\nü\r\n";
    expect(decodeSource(new TextEncoder().encode(src))).toBe(src);
  });
  it("keeps a byte-order mark (what the bytes say)", () => {
    expect(decodeSource(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe("﻿a");
  });
});

describe("sourceContentDisposition (D4, D6)", () => {
  it("an ASCII name is its own fallback and its own filename*", () => {
    expect(sourceContentDisposition("Some Page.md")).toBe(
      "attachment; filename=\"Some Page.md\"; filename*=UTF-8''Some%20Page.md",
    );
  });
  it("non-ASCII is replaced in the fallback and percent-encoded in filename*", () => {
    expect(sourceContentDisposition("Über ✓.md")).toBe(
      "attachment; filename=\"_ber _.md\"; filename*=UTF-8''%C3%9Cber%20%E2%9C%93.md",
    );
  });
  it("quote, backslash, percent and RFC 5987 specials cannot break either form", () => {
    const header = sourceContentDisposition(`a"b\\c%d'e(f)g*.md`);
    expect(header).toBe(`attachment; filename="a_b_c_d'e(f)g*.md"; filename*=UTF-8''a%22b%5Cc%25d%27e%28f%29g%2A.md`);
  });
  it("sourceBasename is the last segment", () => {
    expect(sourceBasename("a/b/c.md")).toBe("c.md");
    expect(sourceBasename("c.md")).toBe("c.md");
  });
});
