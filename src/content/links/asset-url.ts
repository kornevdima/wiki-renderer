/**
 * The asset URL builder and the one image-type allowlist (SA-MOD Link resolution S6-L4, Rendering S6-A4, Reader UI S6-R1).
 *
 * `assetUrl(wikiId, sha, repoPath)` is the ONLY place the asset URL string is assembled, and the asset route imports
 * the same prefix and segment constants, so the builder and the route cannot drift. `wikiId` and `sha` are URL parts
 * here, never a lookup key: this function reads no map. `repoPath` must already be path-guarded (`path-guard.ts`);
 * nothing here re-derives trust from it.
 *
 * `assetContentType(path)` is the ONE allowlist of what the route serves and what the renderer draws as an image, by
 * file EXTENSION. `FileEntry.contentType` is never consulted: it is derived from the same extension by the runtime, but
 * trusting it would let a future mapping (`application/pdf`, `text/markdown`) through (TC-457).
 */

/** The route's URL prefix, before the wiki id. */
export const ASSET_API_PREFIX = "/api/wikis";
/** The literal segment between the wiki id and the sha; the route folder is named after it. */
export const ASSET_SEGMENT = "asset";

export function assetUrl(wikiId: string, sha: string, repoPath: string): string {
  const path = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${ASSET_API_PREFIX}/${encodeURIComponent(wikiId)}/${ASSET_SEGMENT}/${encodeURIComponent(sha)}/${path}`;
}

/**
 * Served image types, by lower-cased extension. `svg` is listed only because the wave 7 spike (W7-6) showed that an
 * `<img>` still draws under the route's SVG headers; if that ever stops holding, remove the entry and the route
 * refuses SVG with its one refusal.
 */
const IMAGE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
});

/** The image `Content-Type` for a path's extension, or `undefined` when it is not a served image type. */
export function assetContentType(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(IMAGE_TYPES, extension) ? IMAGE_TYPES[extension] : undefined;
}

/**
 * True for a request path that belongs to the asset route (`/api/wikis/{id}/asset/...`). `proxy.ts` uses it to step aside
 * for these paths: the route owns its response headers (the SVG sandbox CSP, S6-R2), and a per-request nonce CSP
 * written over them by the proxy would both replace that policy and make the refusals differ on the wire (TC-459).
 * The proxy's auth gate still runs first, so an anonymous request is still the sign-in redirect.
 */
export function isAssetPath(pathname: string): boolean {
  const parts = pathname.split("/");
  const prefix = ASSET_API_PREFIX.split("/");
  return (
    parts.length > prefix.length + 2 &&
    prefix.every((segment, i) => parts[i] === segment) &&
    parts[prefix.length] !== "" &&
    parts[prefix.length + 1] === ASSET_SEGMENT
  );
}
