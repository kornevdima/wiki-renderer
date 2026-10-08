import type { LinkMap } from "@/content/links/types";
import type { ParsedPage } from "@/content/render/types";

/**
 * `content/runtime` types.
 */

/** One file in a snapshot; `contentType` is resolved from the file extension. */
export interface FileEntry {
  bytes: Uint8Array;
  contentType: string;
}

export type { LinkMap };

export type NavNode =
  | { kind: "folder"; name: string; path: string; children: NavNode[] }
  | { kind: "page"; name: string; path: string; title: string };

export interface WikiSnapshot {
  wikiId: string;
  sha: string;
  files: Map<string, FileEntry>;
  pages: Map<string, ParsedPage>;
  /** One per `(wikiId, sha)`, built once in `build()` and read by every render of this sha (SA-MOD Link resolution §4). */
  linkMap: LinkMap;
  /** Serialised search index (`content/search`). */
  searchIndexJson: string;
  tree: NavNode[];
}

export type SnapshotResult =
  | { state: "fresh"; snapshot: WikiSnapshot }
  /** The folder could not be read now; the last good snapshot is served. */
  | { state: "stale"; snapshot: WikiSnapshot; staleSince: Date }
  | { state: "unavailable" }
  /** No configured wiki has this id. */
  | { state: "not_connected" };
