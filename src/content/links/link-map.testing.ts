import { buildLinkMap } from "./link-map";
import type { LinkMap } from "./types";

/** An empty link map for specs that build a `WikiSnapshot` by hand and render no wikilinks. */
export function emptyLinkMap(wikiId = "w", sha = "abc"): LinkMap {
  return buildLinkMap(new Map(), new Map(), wikiId, sha);
}
