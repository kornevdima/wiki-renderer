import type { ParsedPage } from "@/content/render/types";
import type { NavNode } from "./types";

/**
 * Navigation tree (US-061, FR-030), derived only from the build's own `pages` (no adapter, no call).
 *
 * Contents: one `page` node per Markdown path in `pages`; non-Markdown files are not nav nodes (the asset route
 * serves them). A folder exists iff it holds at least one page at any depth. Nothing is filtered by name (DEC-006).
 * Order at every level: folders first, then pages; each group by `name` under a numeric, base-sensitivity `en`
 * collator, ties broken by plain code-unit comparison so the order is total and deterministic. Depth-first
 * "first page in tree order" is the Reader UI landing rule.
 */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareNames(a: string, b: string): number {
  const byCollation = collator.compare(a, b);
  if (byCollation !== 0) return byCollation;
  return a < b ? -1 : a > b ? 1 : 0;
}

interface FolderDraft {
  name: string;
  path: string;
  folders: Map<string, FolderDraft>;
  pages: NavNode[];
}

function newFolder(name: string, path: string): FolderDraft {
  return { name, path, folders: new Map(), pages: [] };
}

function finish(draft: FolderDraft): NavNode[] {
  const folders = [...draft.folders.values()]
    .sort((a, b) => compareNames(a.name, b.name))
    .map(
      (f): NavNode =>
        Object.freeze({ kind: "folder", name: f.name, path: f.path, children: Object.freeze(finish(f)) as NavNode[] }),
    );
  const pages = [...draft.pages].sort((a, b) => compareNames(a.name, b.name));
  return [...folders, ...pages];
}

export function buildTree(pages: Map<string, ParsedPage>): NavNode[] {
  const root = newFolder("", "");
  for (const [path, page] of pages) {
    const segments = path.split("/");
    const fileName = segments.pop() as string;
    let folder = root;
    for (const segment of segments) {
      let child = folder.folders.get(segment);
      if (!child) {
        child = newFolder(segment, folder.path === "" ? segment : `${folder.path}/${segment}`);
        folder.folders.set(segment, child);
      }
      folder = child;
    }
    folder.pages.push(
      Object.freeze({ kind: "page", name: fileName.replace(/\.md$/i, ""), path, title: page.title }) as NavNode,
    );
  }
  return Object.freeze(finish(root)) as NavNode[];
}
