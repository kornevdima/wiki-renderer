import { handleSourceRequest } from "@/components/reader/source-request";
import { findWiki, getSnapshot } from "@/content/runtime";

export const dynamic = "force-dynamic";

/**
 * `GET /api/wikis/{wikiId}/source/{sha}/{path...}` (US-161, CR-005). Wiring only: the order of work, the one refusal
 * and the download headers are in `@/components/reader/source-request`. The URL is built by `sourceDownloadUrl`
 * (`components/reader/source-view.ts`), whose segment constant names this folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wikiId: string; sha: string; path: string[] }> },
): Promise<Response> {
  const { wikiId, sha, path } = await params;
  return handleSourceRequest(
    { wikiId, sha, path },
    {
      canView: async (id) => findWiki(id) !== undefined,
      getSnapshot,
    },
  );
}
