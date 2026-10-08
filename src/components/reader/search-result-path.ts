/**
 * The folder line of a search result (US-222, FR-043; SA-MOD Search E3-S1, TC-518). Derived on the client from the stored
 * repository `path` by dropping the file name; nothing is stored per document. Pure.
 *
 * A page at the wiki root has no folders, so the result shows no path line. Folder names are returned as written, split on
 * `/` only, so a name that holds the `›` separator character stays one name. Empty names (a doubled or trailing slash) are
 * dropped. A path with no extension still loses its last segment, because the last segment is always the file.
 */
export function folderSegments(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts.filter((part) => part !== "");
}
