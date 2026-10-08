import { primeHighlighter } from "@/content/render/highlighter";
import { parsePages } from "@/content/render/parse";
import { buildLinkMap } from "@/content/links/link-map";
import { buildSearchIndex } from "@/content/search/build-index";
import type { ContentSource } from "./source";
import { buildTree } from "./tree";
import type { FileEntry, WikiSnapshot } from "./types";

const CONTENT_TYPES: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export function contentTypeFor(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return CONTENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Builds one complete, immutable snapshot for `(wikiId, sha)` (SA-MOD Content runtime §5.2). One parse feeds the link
 * map, the search index and the tree (TR-011, BR-036).
 *
 * BR-038: the snapshot object and the tree are frozen; the `Map`s are never written after assembly, by convention
 * (freezing a Map does not stop `set`).
 */
export async function build(wikiId: string, sha: string, source: ContentSource): Promise<WikiSnapshot> {
  // Before any page of this snapshot can render (SA-MOD Rendering pipeline S6-A2): `renderPage` is synchronous, so the
  // Shiki highlighter must already exist. Idempotent, never rejects; a failed prime leaves code plain.
  await primeHighlighter();
  const tree = await source.fetchTree(sha);
  const files = new Map<string, FileEntry>();
  for (const [path, bytes] of tree.files) {
    files.set(path, { bytes, contentType: contentTypeFor(path) });
  }
  const pages = parsePages(files);
  const linkMap = buildLinkMap(pages, files, wikiId, sha);
  const searchIndexJson = buildSearchIndex(pages);
  const nav = buildTree(pages);
  return Object.freeze({
    wikiId,
    sha,
    files,
    pages,
    linkMap,
    searchIndexJson,
    tree: nav,
  });
}
