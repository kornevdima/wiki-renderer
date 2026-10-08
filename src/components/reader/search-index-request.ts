import { gzipSync } from "node:zlib";
import type { SnapshotResult, WikiSnapshot } from "@/content/runtime/types";
import { plausibleSha, refusal } from "./route-refusal";

/**
 * The search-index route's decision logic (SA-MOD Search §3; US-090; FR-042, TR-021, SR-013, SR-020, NFR-001; TC-227,
 * TC-472). The route file (`app/api/wikis/[wikiId]/search-index/[sha]/route.ts`) is wiring only. This module owns the
 * order of work, which IS the security property, and is unit-tested with spies on both dependencies.
 *
 * Order of work:
 *
 * 1. The `sha` shape, BEFORE any dependency is called.
 * 2. `canView` (`canViewWiki`), on every request, never cached. Denied or throwing: refuse.
 * 3. `getSnapshot`, only after access is allowed. Anything but `fresh` or `stale`, or a throw: refuse.
 * 4. The sha in the URL must equal the current snapshot's sha, so `immutable` is only claimed for bytes that cannot
 *    change under that URL.
 * 5. Serve `snapshot.searchIndexJson` exactly.
 *
 * ONE refusal for everything else (`route-refusal.ts`, shared with the asset route): 404, an empty body, the same
 * headers. A viewer with no session is redirected to sign-in by the proxy before the route runs.
 *
 * The 200 carries `Content-Security-Policy: default-src 'none'`: the proxy steps aside for this path, so the route's own
 * header is the only policy it has, and a JSON document needs no capability at all.
 *
 * Compression (TC-473, operator ruling 2026-10-01): the standalone server does not compress this route, so it is done
 * here with the built-in `node:zlib`, once per snapshot, memoised on the immutable snapshot object (a `WeakMap`, so
 * evicting the snapshot frees the bytes). A request whose `Accept-Encoding` allows gzip gets `Content-Encoding: gzip`
 * and a matching `Content-Length`; any other gets the identity body. Every 200 says `Vary: Accept-Encoding`. Refusals
 * are untouched.
 */
export interface SearchIndexDeps {
  /** `canViewWiki` for the signed-in viewer; `false` with no session. */
  canView(wikiId: string): Promise<boolean>;
  getSnapshot(wikiId: string): Promise<SnapshotResult>;
  /** The request's `Accept-Encoding` header value, or `null` when absent. */
  acceptEncoding(): string | null;
  /** Test seam: the compressor. Defaults to `zlib.gzipSync`. */
  gzip?(input: string): Uint8Array;
}

export interface SearchIndexParams {
  wikiId: string;
  sha: string;
}

/** The CSP on the served index. */
export const SEARCH_INDEX_CSP = "default-src 'none'";

const gzipMemo = new WeakMap<WikiSnapshot, Uint8Array>();

/** True when `Accept-Encoding` allows gzip: gzip (or `*`) listed with a quality above zero; an explicit gzip entry wins. */
export function acceptsGzip(header: string | null): boolean {
  if (header === null) return false;
  let star: boolean | undefined;
  for (const part of header.split(",")) {
    const [rawName, ...rawParams] = part.trim().split(";");
    const name = rawName!.trim().toLowerCase();
    if (name !== "gzip" && name !== "*") continue;
    let q = 1;
    for (const param of rawParams) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param);
      if (m) q = Number(m[1]);
    }
    const allowed = Number.isFinite(q) && q > 0;
    if (name === "gzip") return allowed;
    star = allowed;
  }
  return star === true;
}

export async function handleSearchIndexRequest(params: SearchIndexParams, deps: SearchIndexDeps): Promise<Response> {
  // 1
  if (!plausibleSha(params.sha)) return refusal();

  try {
    // 2
    if (!(await deps.canView(params.wikiId))) return refusal();
    // 3
    const result = await deps.getSnapshot(params.wikiId);
    if (result.state !== "fresh" && result.state !== "stale") return refusal();
    const { snapshot } = result;
    // 4
    if (snapshot.sha !== params.sha) return refusal();
    // 5
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600, immutable",
      "Content-Security-Policy": SEARCH_INDEX_CSP,
      Vary: "Accept-Encoding",
    };
    if (!acceptsGzip(deps.acceptEncoding())) return new Response(snapshot.searchIndexJson, { status: 200, headers });
    let zipped = gzipMemo.get(snapshot);
    if (zipped === undefined) {
      zipped = (deps.gzip ?? ((input: string) => gzipSync(input)))(snapshot.searchIndexJson);
      gzipMemo.set(snapshot, zipped);
    }
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = String(zipped.byteLength);
    return new Response(zipped as unknown as BodyInit, { status: 200, headers });
  } catch {
    // A throwing access check or snapshot read is a refusal, never a 500 that tells the viewer something.
    return refusal();
  }
}
