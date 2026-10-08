import { handleSearchIndexRequest } from "@/components/reader/search-index-request";
import { findWiki, getSnapshot } from "@/content/runtime";

export const dynamic = "force-dynamic";

/**
 * `GET /api/wikis/{wikiId}/search-index/{sha}` (US-090, SA-MOD Search §3). Wiring only: the order of work and the one
 * refusal are in `@/components/reader/search-index-request`. Only GET is exported, so any other method gets Next's own
 * empty 405 and never index content.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wikiId: string; sha: string }> },
): Promise<Response> {
  const { wikiId, sha } = await params;
  return handleSearchIndexRequest(
    { wikiId, sha },
    {
      canView: async (id) => findWiki(id) !== undefined,
      getSnapshot,
      acceptEncoding: () => request.headers.get("accept-encoding"),
    },
  );
}
