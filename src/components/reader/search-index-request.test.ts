/**
 * US-090 route specs (contract rows 1 to 4; TC-472): `handleSearchIndexRequest` with spies on both dependencies, so the
 * ORDER of work is asserted, not assumed. The route file is wiring only.
 */
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotResult, WikiSnapshot } from "@/content/runtime/types";
import { buildLinkMap } from "@/content/links/link-map";
import { REFUSAL_HEADERS } from "./route-refusal";
import { handleSearchIndexRequest, SEARCH_INDEX_CSP, type SearchIndexDeps } from "./search-index-request";

const WIKI = "6abc14b04a924c5ba918f4ff";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLD_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const INDEX_JSON = JSON.stringify({ documentCount: 2, note: "ünïcode   and </script>" });

function snapshotOf(sha = SHA): WikiSnapshot {
  const files = new Map();
  const pages = new Map();
  return { wikiId: WIKI, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI, sha), searchIndexJson: INDEX_JSON, tree: [] };
}
const fresh = (): SnapshotResult => ({ state: "fresh", snapshot: snapshotOf() });

interface Harness {
  deps: SearchIndexDeps;
  calls: string[];
}
function harness(opts: { allowed?: boolean | "throw"; result?: SnapshotResult | "throw"; ae?: string | null } = {}): Harness {
  const calls: string[] = [];
  const { allowed = true, result = fresh(), ae = null } = opts;
  const deps: SearchIndexDeps = {
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
    acceptEncoding: () => ae,
  };
  return { deps, calls };
}
async function wire(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
    body: new Uint8Array(await response.arrayBuffer()),
  };
}
const request = (h: Harness, sha = SHA, wikiId = WIKI) => handleSearchIndexRequest({ wikiId, sha }, h.deps);

describe("row 1: an allowed viewer gets the index", () => {
  it("200, the exact searchIndexJson, and the exact headers", async () => {
    const res = await request(harness());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_JSON);
    expect([...res.headers.entries()].sort()).toEqual([
      ["cache-control", "private, max-age=3600, immutable"],
      ["content-security-policy", SEARCH_INDEX_CSP],
      ["content-type", "application/json"],
      ["vary", "Accept-Encoding"],
      ["x-content-type-options", "nosniff"],
    ]);
  });
  it("a stale snapshot serves too", async () => {
    const h = harness({ result: { state: "stale", snapshot: snapshotOf(), staleSince: new Date() } });
    expect((await request(h)).status).toBe(200);
  });
  it("canView then getSnapshot, once each, with the wiki id as received", async () => {
    const h = harness();
    await request(h);
    expect(h.calls).toEqual(["canView", "getSnapshot"]);
    expect(h.deps.canView).toHaveBeenCalledWith(WIKI);
    expect(h.deps.getSnapshot).toHaveBeenCalledWith(WIKI);
  });
});

describe("row 2: a viewer without access is refused and the snapshot is never read", () => {
  it("denied: 404, empty body, and getSnapshot is not called", async () => {
    const h = harness({ allowed: false });
    const seen = await wire(await request(h));
    expect(seen.status).toBe(404);
    expect(seen.body.byteLength).toBe(0);
    expect(h.calls).toEqual(["canView"]);
    expect(h.deps.getSnapshot).not.toHaveBeenCalled();
  });
  it("a throwing access check is a refusal and getSnapshot is not called", async () => {
    const h = harness({ allowed: "throw" });
    expect((await request(h)).status).toBe(404);
    expect(h.deps.getSnapshot).not.toHaveBeenCalled();
  });
  it("a malformed sha refuses before either dependency is called", async () => {
    for (const sha of ["", "..", ".", "a/b", "a%2fb", "x".repeat(65), "a b", "a\u0000b"]) {
      const h = harness();
      expect((await request(h, sha)).status, sha).toBe(404);
      expect(h.calls, sha).toEqual([]);
    }
  });
});

describe("row 3: a stale sha is refused", () => {
  it("the URL's sha must equal the current snapshot's sha; there is no fallback to the current index", async () => {
    const seen = await wire(await request(harness(), OLD_SHA));
    expect(seen.status).toBe(404);
    expect(seen.body.byteLength).toBe(0);
  });
});

describe("row 4: private, never public, on every response", () => {
  it("the 200 and every refusal carry private and none carries public", async () => {
    const responses = [
      await request(harness()),
      await request(harness({ allowed: false })),
      await request(harness(), OLD_SHA),
      await request(harness({ result: "throw" })),
      await request(harness(), ".."),
    ];
    for (const res of responses) {
      const cc = res.headers.get("Cache-Control") ?? "";
      expect(cc).toContain("private");
      expect(cc).not.toContain("public");
    }
    expect(responses[0]!.headers.get("Cache-Control")).toContain("immutable");
    expect(responses[1]!.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("TC-472: every refusal reason is the same response", () => {
  const cases: [string, () => Harness, string, string][] = [
    ["denied", () => harness({ allowed: false }), SHA, WIKI],
    ["access check throws", () => harness({ allowed: "throw" }), SHA, WIKI],
    ["unknown wiki", () => harness({ allowed: false }), SHA, "000000000000000000000000"],
    ["not connected", () => harness({ result: { state: "not_connected" } }), SHA, WIKI],
    ["unavailable", () => harness({ result: { state: "unavailable" } }), SHA, WIKI],
    ["snapshot throws", () => harness({ result: "throw" }), SHA, WIKI],
    ["stale sha", () => harness(), OLD_SHA, WIKI],
    ["malformed sha (dots)", () => harness(), "..", WIKI],
    ["malformed sha (slash)", () => harness(), "a/b", WIKI],
    ["malformed sha (long)", () => harness(), "z".repeat(200), WIKI],
  ];
  it("status, headers and body compare equal across at least ten reasons", async () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    const seen = [];
    for (const [name, make, sha, wiki] of cases) seen.push({ name, ...(await wire(await request(make(), sha, wiki))) });
    const first = seen[0]!;
    expect(first.status).toBe(404);
    expect(first.body.byteLength).toBe(0);
    for (const s of seen) {
      expect(s.status, s.name).toBe(404);
      expect(s.body.byteLength, s.name).toBe(0);
      expect(s.headers, s.name).toEqual(first.headers);
    }
  });
  it("the refusal's headers are exactly Cache-Control private, no-store", async () => {
    const res = await request(harness(), OLD_SHA);
    expect([...res.headers.entries()]).toEqual([["cache-control", "private, no-store"]]);
    expect(REFUSAL_HEADERS).toEqual({ "Cache-Control": "private, no-store" });
  });
});

describe("gzip in the route (TC-473)", () => {
  it("gunzip(body) equals searchIndexJson, with Content-Encoding, Vary and an exact Content-Length", async () => {
    const res = await request(harness({ ae: "gzip, deflate, br" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    expect(gunzipSync(bytes).toString("utf8")).toBe(INDEX_JSON);
  });
  it("two requests for one snapshot compress once, and a new snapshot compresses again", async () => {
    const snapshot = snapshotOf();
    const gzip = vi.fn((input: string) => new Uint8Array(Buffer.from(input)));
    const make = (): Harness => {
      const h = harness({ ae: "gzip", result: { state: "fresh", snapshot } });
      h.deps.gzip = gzip;
      return h;
    };
    await request(make());
    await request(make());
    expect(gzip).toHaveBeenCalledTimes(1);
    const other = harness({ ae: "gzip" });
    other.deps.gzip = gzip;
    await request(other);
    expect(gzip).toHaveBeenCalledTimes(2);
  });
  it("identity is sent when gzip is absent, gzip;q=0, or the header is missing, and nothing is compressed", async () => {
    for (const ae of [null, "", "br", "identity", "gzip;q=0", "gzip; q=0.0", "gzip;q=0, *;q=1", "*;q=0"]) {
      const h = harness({ ae });
      const gzip = vi.fn(() => new Uint8Array());
      h.deps.gzip = gzip;
      const res = await request(h);
      expect(res.status, String(ae)).toBe(200);
      expect(res.headers.get("Content-Encoding"), String(ae)).toBeNull();
      expect(res.headers.get("Content-Length"), String(ae)).toBeNull();
      expect(res.headers.get("Vary"), String(ae)).toBe("Accept-Encoding");
      expect(await res.text()).toBe(INDEX_JSON);
      expect(gzip).not.toHaveBeenCalled();
    }
  });
  it("gzip is allowed by q above zero, a wildcard, or upper case", async () => {
    for (const ae of ["gzip;q=0.5", "*", "GZIP", "br;q=1, gzip;q=0.1"]) {
      expect((await request(harness({ ae }))).headers.get("Content-Encoding"), ae).toBe("gzip");
    }
  });
  it("refusals carry no encoding or Vary and the same fixed headers", async () => {
    const res = await request(harness({ allowed: false, ae: "gzip" }));
    expect([...res.headers.entries()]).toEqual([["cache-control", "private, no-store"]]);
  });
});
