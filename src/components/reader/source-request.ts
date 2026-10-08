import type { SnapshotResult } from "@/content/runtime/types";
import { plausibleSha, refusal, REFUSAL_HEADERS, SANDBOX_CSP } from "./route-refusal";
import { sourceBasename, sourceContentDisposition } from "./source-view";
import { resolveRequestedPath } from "./wiki-path";

/**
 * The source download route's decision logic (US-161, CR-005, FR-047, NFR-001; contract D4, D5, D6; TC-495). The route
 * file (`app/api/wikis/[wikiId]/source/[sha]/[...path]/route.ts`) is wiring only. Same order of work as the asset route:
 *
 * 1. The request path rules (`resolveRequestedPath`) and the `sha` shape, before any dependency is called.
 * 2. `canView`. Denied or throwing: refuse.
 * 3. `getSnapshot`. Anything but `fresh` or `stale`, or a throw: refuse.
 * 4. The URL's sha must equal the current snapshot's sha.
 * 5. The path must be a PAGE of the snapshot (`snapshot.pages`), so an image, a PDF or any other file is never served
 *    and a traversal path can never reach a file. Only then are the file's bytes read.
 * 6. Serve those bytes UNCHANGED as an attachment.
 *
 * ONE refusal for everything else (`refusal()`): a denied viewer, an unknown wiki, a wrong sha and a non-page path are
 * indistinguishable. A viewer with no session never reaches the route: the proxy redirects to sign-in.
 */
export interface SourceDeps {
  /** `canViewWiki` for the signed-in viewer; `false` with no session. */
  canView(wikiId: string): Promise<boolean>;
  getSnapshot(wikiId: string): Promise<SnapshotResult>;
}

export interface SourceParams {
  wikiId: string;
  sha: string;
  /** `params.path` as Next hands it over, percent-ENCODED segments. */
  path: readonly string[] | undefined;
}

/** The one refusal's headers, verbatim. */
export const SOURCE_REFUSAL_HEADERS: Readonly<Record<string, string>> = REFUSAL_HEADERS;

/** The CSP on a served download: the proxy steps aside for this route, so this is the only policy it carries. */
export const SOURCE_CSP = SANDBOX_CSP;

export async function handleSourceRequest(params: SourceParams, deps: SourceDeps): Promise<Response> {
  // 1
  const requested = resolveRequestedPath(params.path);
  if (requested.kind !== "page" || !plausibleSha(params.sha)) return refusal();

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
    if (!snapshot.pages.has(requested.path)) return refusal();
    const entry = snapshot.files.get(requested.path);
    if (entry === undefined) return refusal();
    // 6
    return new Response(entry.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Length": String(entry.bytes.byteLength),
        "Content-Disposition": sourceContentDisposition(sourceBasename(requested.path)),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": SOURCE_CSP,
      },
    });
  } catch {
    // A throwing access check or snapshot read is a refusal, never a 500 that tells the viewer something.
    return refusal();
  }
}
