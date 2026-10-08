import type { Crumb } from "@/components/layout/breadcrumbs-view-model";
import type { NavNode } from "@/content/runtime/types";

import { pageHref } from "./wiki-path";

/**
 * The page bar's crumbs (US-188, FR-052): the page's folders in path order, then the page's title as the current crumb.
 * Pure: the only inputs are the open page's path, its title and the snapshot tree the page already holds, so a landing
 * decision costs no read.
 *
 * A folder crumb links to the folder's landing page only when that folder holds a page named exactly `_index.md`, found as a
 * direct child of the folder's node in the tree. A folder without one is plain text: the mockup links every folder, which not
 * every folder supports, and a dead link is worse than none. The page being opened is itself a link target when it is the
 * folder's `_index.md`; that is right, the crumb leads to where the viewer already is. A name the tree does not hold at all
 * (a stale path) is plain text too.
 */
export const FOLDER_LANDING_FILE = "_index.md";

/** The folder node at `folderPath` (a `/`-joined path from the root), or `undefined` when the tree has none. */
function findFolder(tree: readonly NavNode[], folderPath: string): Extract<NavNode, { kind: "folder" }> | undefined {
  for (const node of tree) {
    if (node.kind !== "folder") continue;
    if (node.path === folderPath) return node;
    if (folderPath.startsWith(`${node.path}/`)) return findFolder(node.children, folderPath);
  }
  return undefined;
}

/** The path of `folderPath`'s `_index.md` page, or `null` when the folder holds none. */
export function folderLandingPath(tree: readonly NavNode[], folderPath: string): string | null {
  const folder = findFolder(tree, folderPath);
  if (folder === undefined) return null;
  const landing = folder.children.find((child) => child.kind === "page" && child.path === `${folder.path}/${FOLDER_LANDING_FILE}`);
  return landing === undefined ? null : landing.path;
}

export function buildPageCrumbs(wikiId: string, path: string, title: string, tree: readonly NavNode[]): Crumb[] {
  const segments = path.split("/");
  segments.pop();
  const crumbs: Crumb[] = segments.map((name, index) => {
    const landing = folderLandingPath(tree, segments.slice(0, index + 1).join("/"));
    return landing === null ? { label: name } : { label: name, href: pageHref(wikiId, landing) };
  });
  crumbs.push({ label: title });
  return crumbs;
}
