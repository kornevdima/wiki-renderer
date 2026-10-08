import { assetContentType } from "@/content/links/asset-url";
import type { SnapshotResult } from "@/content/runtime/types";
import { plausibleSha, refusal, REFUSAL_HEADERS, SANDBOX_CSP } from "./route-refusal";
import { resolveRequestedPath } from "./wiki-path";

/**
 * The asset route's decision logic (SA-MOD Reader UI and print S6-R1, S6-R2; US-105; NFR-001, SR-010, SR-020; TC-305,
 * TC-457, TC-458, TC-459). The route file (`app/api/wikis/[wikiId]/asset/[sha]/[...path]/route.ts`) is wiring only:
 * it supplies the viewer check and the snapshot read, and this module owns the order of work, which IS the security
 * property. `next/server` is not imported, so it is unit-tested directly with spies on both dependencies.
 *
 * Order of work:
 *
 * 1. The request path rules (the page route's A1 rules, `resolveRequestedPath`: decode once; empty, `.`, `..`, `/`, `\`,
 *    NUL, control characters and over 1,024 bytes refuse) and the `sha` shape, BEFORE any dependency is called.
 * 2. `canView` (`canViewWiki`). Denied or throwing: refuse.
 * 3. `getSnapshot`. Anything but `fresh` or `stale`, or a throw: refuse.
 * 4. The sha in the URL must equal the current snapshot's sha. There is no older snapshot to look up and no fallback to
 *    the current one under an old URL (TC-458), so `immutable` is only ever claimed for bytes that cannot change.
 * 5. Exact-case lookup in `snapshot.files` (no filesystem). Absent: refuse.
 * 6. The type allowlist, by file EXTENSION (`assetContentType`), never `FileEntry.contentType`: `.md`, `.pdf`, `.html`,
 *    `.txt` and anything unknown refuse even when present (TC-457).
 * 7. Serve the bytes with the extension's own `Content-Type`, `X-Content-Type-Options: nosniff` and
 *    `Cache-Control: private, max-age=3600, immutable`. Every served response carries `Content-Security-Policy: sandbox; default-src 'none'`, and an SVG additionally
 *    `Content-Disposition: attachment` (S6-R2), so opening it directly never runs it on the app's origin.
 *
 * ONE refusal for everything else: status 404, an empty body, the same headers, `Cache-Control: private, no-store`.
 * Nothing in the status, body or headers names a reason, so a denied viewer, a disconnected or revoked wiki, an unknown
 * wiki id, a wrong sha, a missing file and a disallowed type are indistinguishable (TC-459, SR-020). There is no 503
 * branch: an `<img>` request has no view to draw. A viewer with no session is redirected to sign-in by the proxy before
 * the route runs; if one arrives anyway, `canView` is false.
 */
export interface AssetDeps {
  /** `canViewWiki` for the signed-in viewer; `false` with no session. */
  canView(wikiId: string): Promise<boolean>;
  getSnapshot(wikiId: string): Promise<SnapshotResult>;
}

export interface AssetParams {
  wikiId: string;
  sha: string;
  /** `params.path` as Next hands it over, percent-ENCODED segments. */
  path: readonly string[] | undefined;
}

/** The one refusal's headers, verbatim. */
export const ASSET_REFUSAL_HEADERS: Readonly<Record<string, string>> = REFUSAL_HEADERS;

/** The CSP on every served asset (S6-R2, dispatcher ruling on TC-457). */
export const ASSET_SVG_CSP = SANDBOX_CSP;

export const assetRefusal: () => Response = refusal;

export async function handleAssetRequest(params: AssetParams, deps: AssetDeps): Promise<Response> {
  // 1
  const requested = resolveRequestedPath(params.path);
  if (requested.kind !== "page" || !plausibleSha(params.sha)) return assetRefusal();

  try {
    // 2
    if (!(await deps.canView(params.wikiId))) return assetRefusal();
    // 3
    const result = await deps.getSnapshot(params.wikiId);
    if (result.state !== "fresh" && result.state !== "stale") return assetRefusal();
    const { snapshot } = result;
    // 4
    if (snapshot.sha !== params.sha) return assetRefusal();
    // 5
    const entry = snapshot.files.get(requested.path);
    if (entry === undefined) return assetRefusal();
    // 6
    const contentType = assetContentType(requested.path);
    if (contentType === undefined) return assetRefusal();
    // 7
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(entry.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600, immutable",
      // Every served asset, raster or SVG: the proxy steps aside for this route, so this is the only CSP it carries (TC-457).
      "Content-Security-Policy": ASSET_SVG_CSP,
    };
    if (contentType === "image/svg+xml") headers["Content-Disposition"] = "attachment";
    return new Response(entry.bytes as unknown as BodyInit, { status: 200, headers });
  } catch {
    // A throwing access check or snapshot read is a refusal, never a 500 that tells the viewer something.
    return assetRefusal();
  }
}
