/**
 * US-161 download route specs (D4, D5, D6; TC-495): `handleSourceRequest` with spies on both dependencies, so the ORDER of
 * work is asserted. The route file is wiring only.
 */
import { describe, expect, it, vi } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import { parsePages } from "@/content/render/parse";
import type { FileEntry, SnapshotResult, WikiSnapshot } from "@/content/runtime/types";
import { SOURCE_REFUSAL_HEADERS, handleSourceRequest, type SourceDeps } from "./source-request";

const WIKI = "6abc14b04a924c5ba918f4ff";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const SRC = new TextEncoder().encode("---\r\ntitle: T\r\n---\r\n%%c%%\r\n<script>alert(1)</script>\r\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

function snapshotOf(sha = SHA): WikiSnapshot {
  const files = new Map<string, FileEntry>([
    ["docs/Über Page.md", { bytes: SRC, contentType: "text/markdown" }],
    ["img/a.png", { bytes: PNG, contentType: "image/png" }],
    ["notes.txt", { bytes: SRC, contentType: "text/plain" }],
  ]);
  const pages = parsePages(new Map([["docs/Über Page.md", files.get("docs/Über Page.md")!]]));
  return { wikiId: WIKI, sha, files, pages, linkMap: buildLinkMap(pages, files, WIKI, sha), searchIndexJson: "", tree: [] };
}
function harness(opts: { allowed?: boolean | "throw"; result?: SnapshotResult | "throw" } = {}) {
  const calls: string[] = [];
  const { allowed = true, result = { state: "fresh", snapshot: snapshotOf() } as SnapshotResult } = opts;
  const deps: SourceDeps = {
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
const req = (path: string[], sha = SHA, wikiId = WIKI) => ({ wikiId, sha, path });
async function wire(r: Response) {
  return {
    status: r.status,
    headers: [...r.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
    body: new Uint8Array(await r.arrayBuffer()),
  };
}
const PAGE = ["docs", encodeURIComponent("Über Page.md")];

describe("an authorized request is served", () => {
  it("returns the file's bytes unchanged with the download headers", async () => {
    const { deps } = harness();
    const res = await handleSourceRequest(req(PAGE), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"_ber Page.md\"; filename*=UTF-8''%C3%9Cber%20Page.md",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("Content-Length")).toBe(String(SRC.byteLength));
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...SRC]);
  });
  it("a stale snapshot still serves", async () => {
    const { deps } = harness({ result: { state: "stale", snapshot: snapshotOf(), staleSince: new Date() } as SnapshotResult });
    expect((await handleSourceRequest(req(PAGE), deps)).status).toBe(200);
  });
});

describe("D5: one refusal for everything else (TC-495)", () => {
  const cases: Array<[string, () => Promise<Response>]> = [];
  const add = (name: string, path: string[], opts: Parameters<typeof harness>[0] = {}, sha = SHA) =>
    cases.push([name, () => handleSourceRequest(req(path, sha), harness(opts).deps)]);
  add("non-member", PAGE, { allowed: false });
  add("throwing access check", PAGE, { allowed: "throw" });
  add("not connected", PAGE, { result: { state: "not_connected" } as SnapshotResult });
  add("unavailable", PAGE, { result: { state: "unavailable" } as SnapshotResult });
  add("throwing snapshot", PAGE, { result: "throw" });
  add("wrong sha", PAGE, {}, "fedcba9876543210fedcba9876543210fedcba98");
  add("implausible sha", PAGE, {}, "../x");
  add("an image", ["img", "a.png"]);
  add("a non-page text file", ["notes.txt"]);
  add("a missing page", ["nope.md"]);
  add("dot-dot", ["..", "etc", "passwd"]);
  add("encoded dot-dot", ["%2e%2e", "x.md"]);
  add("double-encoded dot-dot", ["%252e%252e", "x.md"]);
  add("absolute", ["%2Fetc%2Fpasswd"]);
  add("no path", []);

  it("every refusal has the same status, headers and empty body", async () => {
    const reference = await wire(await cases[0]![1]());
    expect(reference.status).toBe(404);
    expect(reference.body.byteLength).toBe(0);
    expect(Object.fromEntries(reference.headers)).toEqual({ "cache-control": SOURCE_REFUSAL_HEADERS["Cache-Control"] });
    for (const [name, run] of cases) expect(await wire(await run()), name).toEqual(reference);
  });
  it("reads no file bytes for a refused request (access first, then lookup)", async () => {
    const h = harness({ allowed: false });
    const snap = snapshotOf();
    const getFile = vi.spyOn(snap.files, "get");
    h.deps.getSnapshot = vi.fn(async () => ({ state: "fresh", snapshot: snap }) as SnapshotResult);
    await handleSourceRequest(req(PAGE), h.deps);
    expect(h.deps.getSnapshot).not.toHaveBeenCalled();
    expect(getFile).not.toHaveBeenCalled();
  });
  it("an image path never reads the file map", async () => {
    const snap = snapshotOf();
    const getFile = vi.spyOn(snap.files, "get");
    const h = harness({ result: { state: "fresh", snapshot: snap } });
    await handleSourceRequest(req(["img", "a.png"]), h.deps);
    expect(getFile).not.toHaveBeenCalled();
  });
  it("a bad path or sha calls neither dependency", async () => {
    const h = harness();
    await handleSourceRequest(req(["..", "x"]), h.deps);
    await handleSourceRequest(req(PAGE, "bad/sha"), h.deps);
    expect(h.calls).toEqual([]);
  });
  it("access is checked before the snapshot is read", async () => {
    const h = harness();
    await handleSourceRequest(req(PAGE), h.deps);
    expect(h.calls).toEqual(["canView", "getSnapshot"]);
  });
});
