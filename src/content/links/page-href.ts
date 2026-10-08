/**
 * The canonical, encoded URL of a page: `/w/{wikiId}/{seg}/{seg}` with each segment `encodeURIComponent`'d.
 *
 * Lives in `content/` because the link resolver (`content/render`) and the reader (`components/reader/wiki-path.ts`,
 * which re-exports it) must emit the same href byte for byte, and `content/*` never imports `components/*` or `app/*`.
 * ONE implementation; `wiki-path.ts` only re-exports it.
 */
export function pageHref(wikiId: string, path: string): string {
  return `/w/${encodeURIComponent(wikiId)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
