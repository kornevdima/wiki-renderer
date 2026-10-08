import { isAssetPath } from "@/content/links/asset-url";

/**
 * True for `/api/wikis/{id}/search-index/{sha}`, the search-index route (US-090). Same shape rule as `isAssetPath`: an
 * exact prefix, a non-empty wiki id, the literal segment, then a non-empty sha with nothing after it.
 */
export function isSearchIndexPath(pathname: string): boolean {
  const parts = pathname.split("/");
  return (
    parts.length === 6 &&
    parts[0] === "" &&
    parts[1] === "api" &&
    parts[2] === "wikis" &&
    parts[3] !== "" &&
    parts[4] === "search-index" &&
    parts[5] !== ""
  );
}

/**
 * True for `/api/wikis/{id}/source/{sha}/{path...}`, the Markdown source download route (US-161). The same exact-prefix
 * shape rule as `isAssetPath`: a non-empty wiki id, the literal segment, a non-empty sha and at least one path segment.
 */
export function isSourcePath(pathname: string): boolean {
  const parts = pathname.split("/");
  return (
    parts.length >= 7 &&
    parts[0] === "" &&
    parts[1] === "api" &&
    parts[2] === "wikis" &&
    parts[3] !== "" &&
    parts[4] === "source" &&
    parts[5] !== "" &&
    parts[6] !== ""
  );
}

/**
 * The ONE predicate `proxy.ts` uses to step aside from the nonce CSP (`withSecurityHeaders`): these routes own their
 * response headers (the asset route's sandbox CSP, the search index's fixed CSP, the source download's sandbox CSP, and one fixed
 * refusal header set each, TC-459, TC-472, TC-495). The auth gate still runs for them, so an anonymous request is still the sign-in redirect.
 */
/** The configured brand logo (`src/app/api/brand/logo/route.ts`), which sandboxes an SVG itself. */
export const BRAND_LOGO_PATH = "/api/brand/logo";

export function routeOwnsResponseHeaders(pathname: string): boolean {
  return isAssetPath(pathname) || isSearchIndexPath(pathname) || isSourcePath(pathname) || pathname === BRAND_LOGO_PATH;
}
