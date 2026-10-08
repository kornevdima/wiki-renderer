import { handleAssetRequest } from "@/components/reader/asset-request";
import { findWiki, getSnapshot } from "@/content/runtime";

export const dynamic = "force-dynamic";

/**
 * `GET /api/wikis/{wikiId}/asset/{sha}/{path...}` (US-105, SA-MOD Reader UI and print S6-R1). Wiring only: the order of
 * work, the one refusal and the SVG headers are in `@/components/reader/asset-request`. The URL is built by
 * `assetUrl` (`content/links/asset-url.ts`), whose prefix and segment constants name this folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wikiId: string; sha: string; path: string[] }> },
): Promise<Response> {
  const { wikiId, sha, path } = await params;
  return handleAssetRequest(
    { wikiId, sha, path },
    {
      canView: async (id) => findWiki(id) !== undefined,
      getSnapshot,
    },
  );
}
