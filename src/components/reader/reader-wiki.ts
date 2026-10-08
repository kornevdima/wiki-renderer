import type { LocalWiki } from "@/content/runtime/config";

/**
 * What the reader's sidebar knows about the open wiki: its display name and the folder it is read from. Both come from
 * `WIKI_DIRS`; the folder line tells a reader with several vaults open which checkout they are looking at.
 */
export interface ReaderWiki {
  name: string;
  /** Absent in hand-built specs; the page always sets it. */
  folder?: string;
}

export function readerWikiFor(wiki: LocalWiki): ReaderWiki {
  return { name: wiki.name, folder: wiki.root };
}
