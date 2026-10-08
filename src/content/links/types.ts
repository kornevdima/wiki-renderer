/**
 * Link resolution types (SA-MOD Link resolution §3, Amendment 2026-09-30 S6-L1). Pure types: no runtime, no imports
 * from `@/features/*` or `@/app/*`. `runtime/types.ts` re-exports `LinkMap` so the snapshot type has one owner.
 */

/**
 * The per-`(wikiId, sha)` lookup structures (TR-015). Built once by `buildLinkMap`, frozen, and read by every render of
 * that sha. It holds no page content and no viewer identity (BR-037, NFR-001).
 */
export interface LinkMap {
  readonly wikiId: string;
  readonly sha: string;
  /** Folded basename (no `.md`) -> candidate page paths (TR-016/TR-017). More than one candidate means ambiguous. */
  readonly basenameIndexFolded: ReadonlyMap<string, readonly string[]>;
  /** Exact-case file name (with extension) -> candidate paths, for every non-page file (TR-017). */
  readonly assetBasenameIndex: ReadonlyMap<string, readonly string[]>;
  /** Exact, case-preserving path -> path, for every page and every asset. An exact, un-normalised hit always wins. */
  readonly pathIndex: ReadonlyMap<string, string>;
  /**
   * NFC-normalised path -> every stored path with that key (US-080, TC-447), sorted. Two files whose names differ only
   * by Unicode normalisation share a key, and a lookup that reaches more than one is `ambiguous`, never a pick (TR-016).
   */
  readonly pathIndexNfc: ReadonlyMap<string, readonly string[]>;
  /**
   * NFC-normalised, lower-cased alias text -> the pages declaring it (FR-036, US-079), sorted and de-duplicated by
   * path. More than one page means the alias is shared, which the lookup treats as ambiguous.
   */
  readonly aliasIndex: ReadonlyMap<string, readonly string[]>;
  /** Page path -> its heading slugs (TR-019). Also the set of page paths. Built in wave 4; used by US-077. */
  readonly headingIndex: ReadonlyMap<string, ReadonlySet<string>>;
}

export type RawLinkTarget =
  | { kind: "wikilink"; text: string; heading?: string; display?: string }
  | { kind: "embed-note"; text: string; heading?: string }
  | { kind: "embed-image"; text: string };

export type ResolvedTarget =
  | { kind: "page"; path: string; heading?: { slug?: string; matched: boolean } }
  | { kind: "asset"; path: string }
  | { kind: "unavailable"; reason: "not-found" | "ambiguous" | "traversal-rejected" }
  | { kind: "external"; href: string }
  | { kind: "blocked"; href: string };
