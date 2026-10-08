import { ASSET_API_PREFIX } from "@/content/links/asset-url";
import { pageHref } from "@/content/links/page-href";

/**
 * Pure logic for the Markdown source view and its download (US-161, CR-005, FR-047; contract D1, D4, D6). No React, no
 * Next, no I/O: the page, the download route and `PageShell` are wiring and call these.
 */

/** The literal segment between the wiki id and the sha in the download route's URL; the route folder is named after it. */
export const SOURCE_SEGMENT = "source";

/** The one query value that selects the source view (`?view=source`). */
export const SOURCE_VIEW_VALUE = "source";

/**
 * True only for `?view=source`. Any other value, a repeated parameter or an absent one is the plain page (D1): a
 * repeated `view` arrives as an array and is ignored, never partly honoured.
 */
export function isSourceView(view: string | string[] | undefined): boolean {
  return view === SOURCE_VIEW_VALUE;
}

/** The page's own URL in source view (D1): the page's canonical href plus `?view=source`. */
export function sourceViewHref(wikiId: string, path: string): string {
  return `${pageHref(wikiId, path)}?view=${SOURCE_VIEW_VALUE}`;
}

/** The download route's URL for a page file at the page's snapshot sha (D4). The only place that string is assembled. */
export function sourceDownloadUrl(wikiId: string, sha: string, repoPath: string): string {
  const path = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${ASSET_API_PREFIX}/${encodeURIComponent(wikiId)}/${SOURCE_SEGMENT}/${encodeURIComponent(sha)}/${path}`;
}

/**
 * The file's text exactly as stored: UTF-8, no byte-order mark stripped (`ignoreBOM`), so what the viewer reads and
 * copies is what the bytes say. Invalid sequences become U+FFFD (the display is a view, the download is the bytes).
 */
export function decodeSource(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

/** The last path segment. */
export function sourceBasename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** RFC 5987 `attr-char` percent-encoding: `encodeURIComponent` plus the characters it leaves bare that `attr-char` forbids. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * `Content-Disposition` for the download (D4, D6): an ASCII `filename` fallback (anything outside printable ASCII, and
 * `"`, `\`, `%`, becomes `_`, so the quoted string needs no escaping) and the real name, non-ASCII preserved, in
 * `filename*`.
 */
export function sourceContentDisposition(basename: string): string {
  const fallback = basename.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(basename)}`;
}
