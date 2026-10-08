/**
 * S06 wave 7 route specs (US-105; contract A1 to A6; TC-305, TC-457, TC-458, TC-459): `handleAssetRequest` with spies on
 * both dependencies, so the ORDER of work is asserted, not assumed. The route file is wiring only.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ASSET_API_PREFIX, ASSET_SEGMENT, assetUrl } from "@/content/links/asset-url";
import { buildLinkMap } from "@/content/links/link-map";
import { parsePages } from "@/content/render/parse";
import { renderPage } from "@/content/render/render";
import type { FileEntry, SnapshotResult, WikiSnapshot } from "@/content/runtime/types";
import { ASSET_REFUSAL_HEADERS, ASSET_SVG_CSP, handleAssetRequest, type AssetDeps } from "./asset-request";

const WIKI = "6abc14b04a924c5ba918f4ff";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLD_SHA = "fedcba9876543210fedcba9876543210fedcba98";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80, 0x01]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

/** `contentType` is deliberately HOSTILE for the non-image files: a route that trusts it serves them (A5's mutation). */
function entry(bytes: Uint8Array, contentType: string): FileEntry {
  return { bytes, contentType };
}
function snapshotOf(sha = SHA): WikiSnapshot {
  const files = new Map<string, FileEntry>([
    ["img/ok.png", entry(PNG, "image/png")],
    ["img/Ok.PNG", entry(PNG, "image/png")],
    ["img/photo.JPG", entry(PNG, "image/jpeg")],
    ["img/a.gif", entry(PNG, "image/gif")],
    ["img/a.webp", entry(PNG, "image/webp")],
    ["img/evil.svg", entry(SVG, "image/svg+xml")],
    ["sneaky.png", entry(HTML, "text/html")],
    ["notes.md", entry(HTML, "image/png")],
    ["doc.pdf", entry(HTML, "image/png")],
    ["page.html", entry(HTML, "image/png")],
    ["data.txt", entry(HTML, "image/png")],
    ["data.json", entry(HTML, "image/png")],
    ["noext", entry(HTML, "image/png")],
    ["sp ace/ü.png", entry(PNG, "image/png")],
  ]);
  const pages = parsePages(new Map([["notes.md", entry(HTML, "text/markdown")]]));
  return { wikiId: WIKI, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI, sha), searchIndexJson: "", tree: [] };
}
const fresh = (snapshot = snapshotOf()): SnapshotResult => ({ state: "fresh", snapshot });

interface Harness {
  deps: AssetDeps;
  calls: string[];
}
function harness(opts: { allowed?: boolean | "throw"; result?: SnapshotResult | "throw" } = {}): Harness {
  const calls: string[] = [];
  const { allowed = true, result = fresh() } = opts;
  const deps: AssetDeps = {
    canView: vi.fn(async () => {
      calls.push("canView");
      if (allowed === "throw") throw new Error("boom");
      return allowed;
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("getSnapshot");
      if (result === "throw") throw new Error("boom");
      return result;
    }),
  };
  return { deps, calls };
}
const params = (path: string[], sha = SHA, wikiId = WIKI) => ({ wikiId, sha, path });
/** What a caller can see of a response: status, every header (sorted), and the body bytes. */
async function wire(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
    body: new Uint8Array(await response.arrayBuffer()),
  };
}

describe("A1: an authorized request is served", () => {
  it("200, the extension's Content-Type, the exact bytes, nosniff and private, max-age=3600, immutable", async () => {
    const h = harness();
    const res = await handleAssetRequest(params(["img", "ok.png"]), h.deps);
    const seen = await wire(res);
    expect(seen.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600, immutable");
    expect(res.headers.get("Content-Length")).toBe(String(PNG.byteLength));
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect([...seen.body]).toEqual([...PNG]);
  });
  it("canViewWiki is called BEFORE getSnapshot, once each, with the wiki id as received", async () => {
    const h = harness();
    await handleAssetRequest(params(["img", "ok.png"]), h.deps);
    expect(h.calls).toEqual(["canView", "getSnapshot"]);
    expect(h.deps.canView).toHaveBeenCalledWith(WIKI);
    expect(h.deps.getSnapshot).toHaveBeenCalledWith(WIKI);
  });
  it("a stale snapshot serves too (a stale wiki is still readable)", async () => {
    const h = harness({ result: { state: "stale", snapshot: snapshotOf(), staleSince: new Date() } });
    expect((await handleAssetRequest(params(["img", "ok.png"]), h.deps)).status).toBe(200);
  });
  it("every allowlisted extension is served with its own type, case-insensitively; the path is exact-case", async () => {
    const h = harness();
    for (const [path, type] of [
      [["img", "ok.png"], "image/png"],
      [["img", "Ok.PNG"], "image/png"],
      [["img", "photo.JPG"], "image/jpeg"],
      [["img", "a.gif"], "image/gif"],
      [["img", "a.webp"], "image/webp"],
    ] as const) {
      const res = await handleAssetRequest(params([...path]), h.deps);
      expect(res.status, path.join("/")).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(type);
    }
    expect((await handleAssetRequest(params(["img", "OK.png"]), h.deps)).status).toBe(404);
  });
  it("a percent-encoded segment decodes once (spaces, non-ASCII)", async () => {
    const h = harness();
    const res = await handleAssetRequest(params(["sp%20ace", "%C3%BC.png"]), h.deps);
    expect(res.status).toBe(200);
  });
  it("the URL the renderer writes is the URL the route serves (assetUrl and the route cannot drift)", async () => {
    const snapshot = snapshotOf();
    const files = new Map(snapshot.files);
    files.set("docs/guide.md", entry(new TextEncoder().encode("![pic](../img/ok.png) ![[sp ace/ü.png]]"), "x"));
    const pages = parsePages(files);
    const rendered = renderPage({ ...snapshot, files, pages, linkMap: buildLinkMap(pages, files, WIKI, SHA) }, "docs/guide.md");
    if ("state" in rendered) throw new Error("unavailable");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const srcs = [...renderToStaticMarkup(rendered.content).matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]!);
    expect(srcs).toEqual([assetUrl(WIKI, SHA, "img/ok.png"), assetUrl(WIKI, SHA, "sp ace/ü.png")]);
    for (const src of srcs) {
      const after = src.split(`/asset/${SHA}/`)[1]!;
      const res = await handleAssetRequest(params(after.split("/")), harness().deps);
      expect(res.status, src).toBe(200);
    }
  });
});

describe("A2 (TC-459): every refusal is the same response", () => {
  const refusalCases: [string, () => Harness, ReturnType<typeof params>][] = [
    ["a denied viewer", () => harness({ allowed: false }), params(["img", "ok.png"])],
    ["a throwing access check", () => harness({ allowed: "throw" }), params(["img", "ok.png"])],
    ["a disconnected wiki (not_connected)", () => harness({ result: { state: "not_connected" } }), params(["img", "ok.png"])],
    ["an unavailable snapshot", () => harness({ result: { state: "unavailable" } }), params(["img", "ok.png"])],
    ["a throwing snapshot read", () => harness({ result: "throw" }), params(["img", "ok.png"])],
    ["an unknown wiki id", () => harness({ allowed: false }), params(["img", "ok.png"], SHA, "000000000000000000000000")],
    ["a wrong sha", () => harness(), params(["img", "ok.png"], OLD_SHA)],
    ["a missing file", () => harness(), params(["img", "gone.png"])],
    ["a wrong type (.md)", () => harness(), params(["notes.md"])],
    ["a bad path", () => harness(), params(["..", "ok.png"])],
    ["a bad sha", () => harness(), params(["img", "ok.png"], "../")],
  ];
  it("status 404, an empty body and byte-identical headers across denied, throwing, disconnected, revoked, unknown, wrong sha, missing file, wrong type and bad path", async () => {
    const seen = [];
    for (const [name, make, p] of refusalCases) {
      seen.push({ name, ...(await wire(await handleAssetRequest(p, make().deps))) });
    }
    const first = seen[0]!;
    expect(first.status).toBe(404);
    expect(first.body.byteLength).toBe(0);
    for (const s of seen) {
      expect(s.status, s.name).toBe(404);
      expect(s.body.byteLength, s.name).toBe(0);
      // The header MAPS are compared whole, sorted: a header present in one refusal and absent in another fails here.
      expect(s.headers, s.name).toEqual(first.headers);
    }
  });
  it("the refusal's headers, verbatim: Cache-Control private, no-store and nothing else (no ETag, no Content-Type, no immutable)", async () => {
    const res = await handleAssetRequest(params(["img", "ok.png"], OLD_SHA), harness().deps);
    expect([...res.headers.entries()]).toEqual([["cache-control", "private, no-store"]]);
    expect(ASSET_REFUSAL_HEADERS).toEqual({ "Cache-Control": "private, no-store" });
    expect(res.headers.get("Content-Type")).toBeNull();
    expect(res.headers.get("ETag")).toBeNull();
    expect(res.headers.get("Cache-Control")).not.toContain("immutable");
  });
  it("a disconnected wiki with a warm cache returns no image bytes even though the snapshot holds them", async () => {
    for (const state of ["not_connected"] as const) {
      const res = await handleAssetRequest(params(["img", "ok.png"]), harness({ result: { state } }).deps);
      expect((await wire(res)).body.byteLength).toBe(0);
    }
  });
  it("a denied viewer never reaches getSnapshot", async () => {
    const h = harness({ allowed: false });
    await handleAssetRequest(params(["img", "ok.png"]), h.deps);
    expect(h.calls).toEqual(["canView"]);
  });
});

describe("A3: the path rules refuse before any dependency is touched", () => {
  const bad: [string, string[]][] = [
    ["an empty path", []],
    ["..", ["..", "ok.png"]],
    ["encoded ..", ["%2e%2e", "ok.png"]],
    ["encoded slash in a segment", ["img%2f..%2fok.png"]],
    ["encoded backslash", ["img%5cok.png"]],
    ["a literal backslash", ["img\\ok.png"]],
    ["NUL", ["ok%00.png"]],
    ["a control character", ["ok%01.png"]],
    ["a dot segment", [".", "ok.png"]],
    ["an empty segment", ["img", "", "ok.png"]],
    ["a malformed escape", ["%E0%A4%A.png"]],
    ["over 1,024 bytes", ["a".repeat(1025)]],
  ];
  for (const [name, path] of bad) {
    it(`${name} is refused with neither canViewWiki nor getSnapshot called`, async () => {
      const h = harness();
      const res = await handleAssetRequest(params(path), h.deps);
      expect(res.status).toBe(404);
      expect(h.calls).toEqual([]);
    });
  }
  it("a double-encoded segment decodes ONCE, so it names a file that does not exist (no second decode)", async () => {
    const h = harness();
    const res = await handleAssetRequest(params(["img", "%256fk.png"]), h.deps);
    expect(res.status).toBe(404);
    expect(h.calls).toEqual(["canView", "getSnapshot"]);
  });
  it("a malformed or empty sha is refused before any dependency", async () => {
    for (const sha of ["", "..", ".", "a/b", "a b", "x".repeat(65)]) {
      const h = harness();
      expect((await handleAssetRequest(params(["img", "ok.png"], sha), h.deps)).status, sha).toBe(404);
      expect(h.calls, sha).toEqual([]);
    }
  });
});

describe("A4 (TC-458): only the current sha gets bytes", () => {
  it("the current sha is served; a previous one is the one refusal, never immutable and never a max-age", async () => {
    const h = harness();
    const current = await handleAssetRequest(params(["img", "ok.png"], SHA), h.deps);
    const previous = await handleAssetRequest(params(["img", "ok.png"], OLD_SHA), h.deps);
    expect(current.status).toBe(200);
    expect(previous.status).toBe(404);
    expect(previous.headers.get("Cache-Control")).toBe("private, no-store");
    expect(previous.headers.get("Cache-Control")).not.toMatch(/immutable|max-age/);
    expect((await wire(previous)).body.byteLength).toBe(0);
  });
  it("an uppercase spelling of the current sha is not the current sha", async () => {
    const res = await handleAssetRequest(params(["img", "ok.png"], SHA.toUpperCase()), harness().deps);
    expect(res.status).toBe(404);
  });
  it("after a push the old URL refuses and the new one serves: no fallback to the current snapshot under an old URL", async () => {
    const h = harness({ result: fresh(snapshotOf(OLD_SHA)) });
    expect((await handleAssetRequest(params(["img", "ok.png"], SHA), h.deps)).status).toBe(404);
    expect((await handleAssetRequest(params(["img", "ok.png"], OLD_SHA), h.deps)).status).toBe(200);
  });
});

describe("A5 (TC-457): only image types, decided by the extension", () => {
  it(".md, .pdf, .html, .txt, .json and no extension refuse even when present, whatever FileEntry.contentType claims", async () => {
    const h = harness();
    for (const path of ["notes.md", "doc.pdf", "page.html", "data.txt", "data.json", "noext"]) {
      const res = await handleAssetRequest(params([path]), h.deps);
      expect(res.status, path).toBe(404);
      expect((await wire(res)).body.byteLength, path).toBe(0);
    }
  });
  it("sneaky.png (HTML bytes) is served as image/png with nosniff: the browser will not render it as HTML", async () => {
    const res = await handleAssetRequest(params(["sneaky.png"]), harness().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("SVG (W7-6): served only with the sandbox CSP, attachment and nosniff", async () => {
    const res = await handleAssetRequest(params(["img", "evil.svg"]), harness().deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(ASSET_SVG_CSP).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("Content-Disposition")).toBe("attachment");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600, immutable");
  });
  it("the served header set per type, exactly (png, jpeg, gif, webp, svg)", async () => {
    const h = harness();
    const base = { "cache-control": "private, max-age=3600, immutable", "content-length": String(PNG.byteLength), "content-security-policy": "sandbox; default-src 'none'", "x-content-type-options": "nosniff" };
    const cases: [string[], string, number, Record<string, string>][] = [
      [["img", "ok.png"], "image/png", PNG.byteLength, {}],
      [["img", "photo.JPG"], "image/jpeg", PNG.byteLength, {}],
      [["img", "a.gif"], "image/gif", PNG.byteLength, {}],
      [["img", "a.webp"], "image/webp", PNG.byteLength, {}],
      [["sneaky.png"], "image/png", HTML.byteLength, {}],
      [["img", "evil.svg"], "image/svg+xml", SVG.byteLength, { "content-disposition": "attachment" }],
    ];
    for (const [path, type, length, extra] of cases) {
      const res = await handleAssetRequest(params(path), h.deps);
      expect(Object.fromEntries(res.headers.entries()), path.join("/")).toEqual({ ...base, "content-length": String(length), "content-type": type, ...extra });
    }
  });
});

describe("A6 (TC-305): an authorized viewer, a valid wiki, a missing file", () => {
  it("is the one refusal: 404, no bytes, nothing about the wiki's other files", async () => {
    const h = harness();
    const res = await handleAssetRequest(params(["images", "does-not-exist.png"]), h.deps);
    const seen = await wire(res);
    expect(seen.status).toBe(404);
    expect(seen.body.byteLength).toBe(0);
    expect(h.calls).toEqual(["canView", "getSnapshot"]);
    const other = await wire(await handleAssetRequest(params(["img", "ok.png"], OLD_SHA), harness().deps));
    expect(seen.headers).toEqual(other.headers);
  });
  it("a file that exists only under another case is missing (exact-case lookup, no filesystem)", async () => {
    expect((await handleAssetRequest(params(["IMG", "ok.png"]), harness().deps)).status).toBe(404);
  });
});

describe("the route file sits where assetUrl says it does", () => {
  it("src/app/api/wikis/[wikiId]/asset/[sha]/[...path]/route.ts, named by the shared constants", () => {
    expect(ASSET_API_PREFIX).toBe("/api/wikis");
    const dir = fileURLToPath(new URL("../../app", import.meta.url));
    const route = `${dir}${ASSET_API_PREFIX}/[wikiId]/${ASSET_SEGMENT}/[sha]/[...path]/route.ts`;
    expect(existsSync(route)).toBe(true);
  });
});

describe("the framing header lives in next.config for the whole asset route", () => {
  it("X-Frame-Options SAMEORIGIN is declared for /api/wikis/:wikiId/asset/:path*, the one header source (no copy in the route)", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync(fileURLToPath(new URL("../../../next.config.ts", import.meta.url)), "utf8");
    expect(config).toMatch(/source: "\/api\/wikis\/:wikiId\/asset\/:path\*",\s*headers: \[\{ key: "X-Frame-Options", value: "SAMEORIGIN" \}\]/);
    expect(ASSET_REFUSAL_HEADERS).toEqual({ "Cache-Control": "private, no-store" });
  });
});
