import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { NavNode } from "@/content/runtime/types";

import { NavScroll } from "./nav-scroll";
import { pageHref } from "./wiki-path";

/**
 * The navigation tree (SA-MOD Reader UI and print §2, Amendment A2; US-097, FR-030). A server component with no
 * script: folders are native `<details>`/`<summary>`, so expand and collapse need no client JavaScript (keyboard
 * behaviour beyond the native one is US-109).
 *
 * Content and order come VERBATIM from `snapshot.tree` (N2): this file never sorts, filters, dedups or renames.
 * `buildTree` owns that, and DEC-006 forbids hiding a folder by its name. The props carry no session or access
 * input: the page has already run `canViewWiki` (a type pin in `nav-tree.test.ts`).
 *
 * A folder is `open` only when it is an ancestor of `activePath`; the active page's link carries
 * `aria-current="page"`. Hrefs come from `pageHref` (R-2: repository path with `.md`, each segment encoded). `NavScroll` (US-219)
 * scrolls the nav to the current page whenever a page opens; it renders nothing.
 */
export interface NavTreeProps {
  wikiId: string;
  tree: NavNode[];
  activePath: string | null;
}

function isOnActivePath(folderPath: string, activePath: string | null): boolean {
  return activePath !== null && activePath.startsWith(`${folderPath}/`);
}

/** The ESG tree (reader mockup `.wr-tree`, US-187): depth is drawn here as an indent guide under the chevron, since Preflight strips list padding. */
export const NAV_LIST_CLASS = "grid gap-0.5";
export const NAV_NESTED_LIST_CLASS = "ml-4 mt-0.5 grid gap-0.5 border-l border-border pl-2";
export const NAV_SUMMARY_CLASS =
  "flex min-h-8 cursor-pointer list-none items-start gap-1 rounded-(--ds-radius-sm) px-2 py-1.5 text-foreground hover:bg-hover-overlay [&::-webkit-details-marker]:hidden";
/** The chevron turns when its folder is open; the turn is off under reduced motion. */
export const NAV_CHEVRON_CLASS =
  "mt-0.5 size-(--icon-ui) flex-none text-ink-muted transition-[transform] duration-(--duration-fast) ease-standard group-open/folder:rotate-90 motion-reduce:transition-none";
/** The active link is styled only through the `aria-current` attribute, which stays the single source. Page text lines up with folder text. */
export const NAV_LINK_CLASS =
  "flex min-h-8 items-start rounded-(--ds-radius-sm) py-1.5 pr-2 pl-7 text-muted-foreground no-underline hover:bg-hover-overlay hover:text-foreground aria-[current=page]:bg-surface-selected aria-[current=page]:font-bold aria-[current=page]:text-primary-text";

function renderNodes(wikiId: string, nodes: readonly NavNode[], activePath: string | null, nested: boolean): ReactNode {
  return (
    <ul className={nested ? NAV_NESTED_LIST_CLASS : NAV_LIST_CLASS}>
      {nodes.map((node) =>
        node.kind === "folder" ? (
          <li key={`f:${node.path}`}>
            <details open={isOnActivePath(node.path, activePath)} data-testid="nav-folder" className="group/folder">
              <summary className={NAV_SUMMARY_CLASS}>
                <ChevronRightIcon aria-hidden="true" className={NAV_CHEVRON_CLASS} />
                {node.name}
              </summary>
              {renderNodes(wikiId, node.children, activePath, true)}
            </details>
          </li>
        ) : (
          <li key={`p:${node.path}`}>
            <Link
              href={pageHref(wikiId, node.path)}
              aria-current={node.path === activePath ? "page" : undefined}
              className={NAV_LINK_CLASS}
              data-testid="nav-page"
            >
              {node.title === "" ? node.name : node.title}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

export function NavTree({ wikiId, tree, activePath }: NavTreeProps) {
  const t = useTranslations("readerShell");
  return (
    <nav aria-label={t("navLabel")} data-testid="reader-nav" className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4 text-sm/5 [overflow-wrap:anywhere]">
      {renderNodes(wikiId, tree, activePath, false)}
      <NavScroll activePath={activePath} />
    </nav>
  );
}
