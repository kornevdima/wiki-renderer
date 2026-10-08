import type { ParsedPage } from "@/content/render/types";
import type { FileEntry } from "@/content/runtime/types";
import type { LinkMap } from "./types";

/**
 * The one fold rule for bare note links (TR-017, US-080, TC-447): Unicode NFC, then `toLowerCase()` (lower-casing, not
 * full case folding: `[[STRASSE]]` does not match `Straße.md`, OA-9). The basename index, the alias index and the
 * link text all go through this one function.
 */
export function foldName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** The file-extension strip every bare lookup applies to link text; index keys (aliases) get the same one. */
export function stripMdExtension(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** Characters a wikilink target cannot express (they split the link syntax), so an alias holding one is never indexed. */
const UNREACHABLE_ALIAS = /[#|/[\]]/;

/** The index key for an alias, or `undefined` when it must not be indexed (TC-448). */
function aliasKey(alias: unknown): string | undefined {
  if (typeof alias !== "string") return undefined;
  const key = foldName(stripMdExtension(alias.trim()));
  return key === "" || UNREACHABLE_ALIAS.test(key) ? undefined : key;
}

/** The last path segment. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The file name without its `.md` extension (the `parse.ts` title-stem rule). */
export function noteNameOf(path: string): string {
  return fileNameOf(path).replace(/\.md$/i, "");
}

function pushTo(index: Map<string, string[]>, key: string, path: string): void {
  const list = index.get(key);
  if (list) list.push(path);
  else index.set(key, [path]);
}

/**
 * Builds the link map for one `(wikiId, sha)` (SA-MOD Link resolution §5, Amendment 2026-09-30 S6-L1). It derives from
 * the ONE parse `content/runtime`'s `build` produced (BR-036), never re-parses, and takes the snapshot `files` because
 * `ParsedPage` exists only for Markdown and the asset index needs every other file.
 *
 * - `basenameIndexFolded`, `aliasIndex`, `headingIndex`: pages only.
 * - `assetBasenameIndex`: files that are not parsed pages, exact-case file name with extension.
 * - `pathIndex`: pages and assets, exact case.
 *
 * The result and the candidate lists are frozen (BR-038 sibling rule, SA-MOD Link resolution §4); a `Map` itself is
 * read-only by convention and by its `ReadonlyMap` type, as for the snapshot's other maps. Every candidate list is
 * sorted and holds each path once, so the map does not depend on page insertion order. A shared alias keeps ALL its
 * pages: the lookup decides it is ambiguous (US-079); "first page wins" is gone.
 */
export function buildLinkMap(
  pages: Map<string, ParsedPage>,
  files: Map<string, FileEntry>,
  wikiId: string,
  sha: string,
): LinkMap {
  const basenameIndexFolded = new Map<string, string[]>();
  const assetBasenameIndex = new Map<string, string[]>();
  const pathIndex = new Map<string, string>();
  const pathIndexNfc = new Map<string, string[]>();
  const aliasSets = new Map<string, Set<string>>();
  const headingIndex = new Map<string, ReadonlySet<string>>();

  for (const [path, page] of pages) {
    pathIndex.set(path, path);
    pushTo(pathIndexNfc, path.normalize("NFC"), path);
    pushTo(basenameIndexFolded, foldName(noteNameOf(path)), path);
    for (const alias of page.aliases as readonly unknown[]) {
      const key = aliasKey(alias);
      if (key === undefined) continue;
      const set = aliasSets.get(key);
      if (set) set.add(path);
      else aliasSets.set(key, new Set([path]));
    }
    headingIndex.set(path, Object.freeze(new Set(page.headings.map((h) => h.slug))));
  }
  for (const path of files.keys()) {
    if (pages.has(path)) continue;
    pathIndex.set(path, path);
    pushTo(pathIndexNfc, path.normalize("NFC"), path);
    pushTo(assetBasenameIndex, fileNameOf(path), path);
  }
  const aliasIndex = new Map<string, string[]>();
  for (const [key, set] of aliasSets) aliasIndex.set(key, [...set]);
  for (const index of [basenameIndexFolded, aliasIndex, assetBasenameIndex, pathIndexNfc]) {
    for (const list of index.values()) Object.freeze(list.sort());
  }

  return Object.freeze({
    wikiId,
    sha,
    basenameIndexFolded,
    assetBasenameIndex,
    pathIndex,
    pathIndexNfc,
    aliasIndex,
    headingIndex,
  });
}
