import { assetUrl } from "@/content/links/asset-url";
import { findWiki, getSnapshot } from "@/content/runtime";

export const dynamic = "force-dynamic";

/**
 * The editor's image preview: a wiki path, redirected to the asset route at the wiki's current snapshot sha. The asset
 * route only serves the current sha, and a save or an upload moves it on, so the editor never holds a sha itself. Every
 * check (path, type, sha) stays the asset route's; this only adds the redirect, `private, no-store`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wikiId: string; path: string[] }> },
): Promise<Response> {
  const { wikiId, path } = await params;
  const refusal = new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (findWiki(wikiId) === undefined) return refusal;
  const result = await getSnapshot(wikiId).catch(() => null);
  if (result === null || (result.state !== "fresh" && result.state !== "stale")) return refusal;
  return new Response(null, {
    status: 307,
    headers: { Location: assetUrl(wikiId, result.snapshot.sha, path.join("/")), "Cache-Control": "private, no-store" },
  });
}
