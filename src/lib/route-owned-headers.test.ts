/**
 * Q5 / row 8 (US-090): the one predicate `proxy.ts` uses to step aside from the nonce CSP. `proxy.ts` itself is
 * next/server wiring and cannot be imported under vitest, so the decision is pinned here.
 */
import { describe, expect, it } from "vitest";
import { assetUrl } from "@/content/links/asset-url";
import { isSearchIndexPath, isSourcePath, routeOwnsResponseHeaders } from "./route-owned-headers";

describe("isSearchIndexPath", () => {
  it("matches the route's URL and nothing else", () => {
    expect(isSearchIndexPath("/api/wikis/w1/search-index/abc123")).toBe(true);
    for (const path of [
      "/api/wikis/w1/search-index",
      "/api/wikis/w1/search-index/",
      "/api/wikis//search-index/abc",
      "/api/wikis/w1/search-index/abc/extra",
      "/api/wikis/w1/search-indexes/abc",
      "/api/wikis/w1/asset/abc/x.png",
      "/x/api/wikis/w1/search-index/abc",
      "/w/w1/search-index/abc",
      "/api/health",
      "/",
    ]) {
      expect(isSearchIndexPath(path), path).toBe(false);
    }
  });
});

describe("isSourcePath (US-161)", () => {
  it("matches the download route's URL and nothing else", () => {
    expect(isSourcePath("/api/wikis/w1/source/abc/a.md")).toBe(true);
    expect(isSourcePath("/api/wikis/w1/source/abc/a/b%20c.md")).toBe(true);
    expect(routeOwnsResponseHeaders("/api/wikis/w1/source/abc/a.md")).toBe(true);
    for (const path of [
      "/api/wikis/w1/source/abc",
      "/api/wikis/w1/source/abc/",
      "/api/wikis//source/abc/a.md",
      "/api/wikis/w1/source//a.md",
      "/api/wikis/w1/sources/abc/a.md",
      "/x/api/wikis/w1/source/abc/a.md",
      "/w/w1/source/abc/a.md",
      "/w/w1/a.md",
    ]) {
      expect(isSourcePath(path), path).toBe(false);
    }
  });
});

describe("routeOwnsResponseHeaders: the proxy's single step-aside predicate", () => {
  it("is true for the asset route and the search-index route", () => {
    expect(routeOwnsResponseHeaders(assetUrl("w1", "abc", "a/b.png"))).toBe(true);
    expect(routeOwnsResponseHeaders("/api/wikis/w1/search-index/abc")).toBe(true);
  });
  it("is false for pages and every other route, which keep the nonce CSP", () => {
    for (const path of ["/", "/w/w1", "/api/health", "/api/wikis/w1", "/api/auth/session", "/admin"]) {
      expect(routeOwnsResponseHeaders(path), path).toBe(false);
    }
  });
});
