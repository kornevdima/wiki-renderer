import { AppShell } from "@/components/layout/app-shell";
import { MAIN_REGION } from "@/components/layout/main-region";
import { NavToggle } from "@/components/layout/nav-toggle";
import { Topbar } from "@/components/layout/topbar";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { FrontmatterField, OutlineEntry } from "@/content/render/types";
import type { NavNode } from "@/content/runtime/types";

import { ThemeSelect } from "@/components/theme-control";

import { AllProperties } from "./all-properties";
import { HeadingAnchorCopy } from "./heading-anchor-copy";
import { OnThisPage } from "./on-this-page";
import { showsOutline } from "./outline-tree";
import { PageBar } from "./page-bar";
import { buildPageCrumbs } from "./page-crumbs";
import { ReaderSidebar } from "./reader-sidebar";
import type { ReaderWiki } from "./reader-wiki";
import { SearchCommandDialog } from "./search-command-dialog";
import { SectionSpy } from "./section-spy";
import { StaleNotice } from "./stale-notice";

/**
 * The reader shell (SA-MOD Reader UI and print §3, Amendment A2; US-158, US-187). The layout kit's `AppShell` (US-176) with the
 * reader's sidebar (`ReaderSidebar`: brand, the one WIKI control "All wikis" to `/`, the wiki name, the tree, the Language
 * select) and a topbar holding the menu button below `bp-lg`, the Search trigger (US-091, S7-R1) and the theme select. There is
 * no wiki switcher (`wiki-switcher-pin.test.ts`). The page's one `main` is the article; the page rail (`aside`, "Page details") stays beside it.
 *
 * The A2 prop `stale` (wave 8) puts the stale notice above the article. The A2 props `tree` and `activePath` (wave 9, US-097)
 * feed the sidebar's tree; an empty `tree` renders no `<nav>`. The shell is rendered by the page, never from a `layout.tsx`,
 * so `getSnapshot` keeps one call site per route (A2, US-099).
 *
 * US-188: for an open page (`activePath` set) the page bar sits above the article: breadcrumbs from `activePath`, `pageTitle`
 * and `tree` (`buildPageCrumbs`), and the page's actions. The empty view (no `activePath`) has no page bar. The stale notice, the page bar and the article share one centred column (`wr-column`, US-218) no wider than the `measure` token;
 * the page rail (All properties, US-220) sits beside the article from 1200 px (the column widens by its width) and after it below.
 */
export interface PageShellProps {
  wikiId: string;
  /** The wiki's name and folder: build it with `readerWikiFor`. */
  wiki: ReaderWiki;
  /** The page's snapshot sha, from the page's single snapshot read; the search dialog fetches the index for it (S7-R1). */
  sha: string;
  /** `snapshot.tree` exactly as `buildTree` emitted it (N2, N3). */
  tree: NavNode[];
  /** The page being shown, or `null` on the empty view. */
  activePath: string | null;
  /** The open page's title, the last (current) crumb; the page passes the title it renders. Unused when `activePath` is `null`. */
  pageTitle?: string;
  /** Present only when the notice is due (`isStaleNoticeDue`). Carries no cause: `{ since }` and nothing else (T13). */
  stale?: { since: Date };
  /** `rendered.frontmatterView` as built (US-071); absent or empty renders no panel (US-108). */
  frontmatter?: FrontmatterField[];
  /**
   * `rendered.outline` (US-219): the page's own h2 and h3 headings, each with its final id. Any entry means the headings carry
   * copy anchors, so the anchor island is mounted; three or more means the "On this page" list (the rail's copy here, the folded
   * copy is rendered by the page under the meta line) and the scroll-spy. Absent on every screen that is not a rendered page.
   */
  outline?: OutlineEntry[];
  /** The page's Mermaid placeholder count from the render's single pass (`rendered.mermaidBlocks.length`); 0 when absent (US-106). */
  diagramCount?: number;
  /** `diagramSetKey(path, mermaidBlocks)`, the key the page's Mermaid view begins with; Save as PDF is ready only for it (C1). */
  viewKey?: string;
  /**
   * The source-view header controls (US-161, D2). `page`: the rendered page, with a "View source" link to `sourceHref`.
   * `source`: the source view, with "View page" (`pageHref`), "Copy" (the exact `text`) and "Download .md"
   * (`downloadHref`); Save as PDF and its hint are not shown there. Absent on the landing and empty views.
   */
  sourceControls?:
    | { mode: "page"; sourceHref: string }
    | { mode: "source"; pageHref: string; downloadHref: string; text: string };
  children: ReactNode;
}

export function PageShell({ wikiId, wiki, sha, tree, activePath, pageTitle, stale, frontmatter, outline, diagramCount = 0, viewKey = "", sourceControls, children }: PageShellProps) {
  const tSearch = useTranslations("search");
  const tRail = useTranslations("pageRail");
  const hasProperties = frontmatter !== undefined && frontmatter.length > 0;
  const hasAnchors = outline !== undefined && outline.length > 0;
  const hasToc = outline !== undefined && showsOutline(outline);
  const hasRail = hasProperties || hasToc;
  const searchCopy = {
    trigger: tSearch("trigger"),
    triggerLabel: tSearch("triggerLabel"),
    dialogTitle: tSearch("dialogTitle"),
    inputLabel: tSearch("inputLabel"),
    inputPlaceholder: tSearch("inputPlaceholder"),
    idle: tSearch("idle"),
    loading: tSearch("loading"),
    failed: tSearch("failed"),
    // Raw: the query is substituted by the client component as React text.
    empty: tSearch.raw("empty") as string,
    emptyText: tSearch("emptyText"),
    shortcutApple: tSearch("shortcutApple"),
    shortcutOther: tSearch("shortcutOther"),
    listLabel: tSearch("listLabel"),
    resultCountOne: tSearch("resultCountOne"),
    // Raw: the client component substitutes `{count}` itself.
    resultCountOther: tSearch.raw("resultCountOther") as string,
    close: tSearch("close"),
  };

  return (
    <AppShell
      testId="reader-shell"
      dataAttributes={{ "data-wiki-id": wikiId }}
      sidebar={<ReaderSidebar wikiId={wikiId} wiki={wiki} tree={tree} activePath={activePath} />}
      topbar={
        <Topbar
          leading={
            <>
              <NavToggle />
              <SearchCommandDialog wikiId={wikiId} sha={sha} copy={searchCopy} />
            </>
          }
        >
          <ThemeSelect />
        </Topbar>
      }
    >
      <div className="wr-column" data-testid="reader-column">
        {stale ? <StaleNotice since={stale.since} /> : null}
        {activePath !== null ? (
          <PageBar
            crumbs={buildPageCrumbs(wikiId, activePath, pageTitle ?? activePath, tree)}
            sourceControls={sourceControls}
            diagramCount={diagramCount}
            viewKey={viewKey}
          />
        ) : null}
        <div className={hasRail ? "wr-layout wr-layout--aside" : "wr-layout"}>
          <main {...MAIN_REGION} data-testid="reader-content" className="wr-prose min-w-0">
            {children}
          </main>
          {hasRail ? (
            // The page rail (SA-MOD Reader UI and print E3-D5): one complementary landmark beside the article, outside <main>.
            // The "On this page" list (US-219) sits above All properties (US-220). Below 1200px the list's rail copy is hidden
            // (the folded copy under the meta line shows instead) and an aside that holds only that copy is hidden whole.
            <aside aria-label={tRail("label")} data-testid="reader-rail" className="wr-rail">
              {hasToc ? <OnThisPage outline={outline} variant="rail" /> : null}
              {hasProperties ? <AllProperties fields={frontmatter} /> : null}
            </aside>
          ) : null}
        </div>
        {hasAnchors ? <HeadingAnchorCopy /> : null}
        {hasToc ? <SectionSpy pageKey={activePath ?? ""} ids={outline.map((entry) => entry.id)} /> : null}
      </div>
    </AppShell>
  );
}
