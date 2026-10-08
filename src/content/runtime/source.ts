/**
 * The port `build()` reads a wiki through. The local filesystem source (`local-source.ts`) is the only
 * implementation; tests hand-build one from a record of paths.
 */

/** A wiki's files at one revision, keyed by wiki-relative POSIX path. */
export interface WikiFileTree {
  sha: string;
  files: Map<string, Uint8Array>;
  totalBytes: number;
}

export interface ContentSource {
  /** A revision id for the current contents: equal ids mean equal files. */
  getLatestSha(): Promise<string>;
  fetchTree(sha: string): Promise<WikiFileTree>;
}
