import { ArrowLeftIcon, BookIcon, GlobeIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Brand } from "@/components/layout/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { NavNode } from "@/content/runtime/types";

import { NavClose } from "./nav-close";
import { NavTree } from "./nav-tree";
import type { ReaderWiki } from "./reader-wiki";

/**
 * The reader's sidebar (US-187, FR-052, FR-030, FR-031; reader mockup state 1), the content of the `AppShell`'s sidebar slot
 * and of its off-canvas drawer below `bp-lg`. Top to bottom: the brand, "All wikis" with an arrow (to `/`, US-096: the only
 * way to another wiki, there is no switcher), the wiki's name with a book icon, then, the
 * folder the wiki is read from, then the page tree, then the Language select with its visible label in the foot (English only, US-098).
 *
 * A server component with no script of its own.
 */
export interface ReaderSidebarProps {
  wikiId: string;
  wiki: ReaderWiki;
  tree: NavNode[];
  activePath: string | null;
}

export function ReaderSidebar({ wikiId, wiki, tree, activePath }: ReaderSidebarProps) {
  const t = useTranslations("readerShell");
  const tBrand = useTranslations("brand");
  const tLocale = useTranslations("localeSwitcher");
  return (
    <div data-testid="reader-sidebar" className="flex h-full min-h-0 flex-col bg-muted text-foreground print:hidden">
      <div className="relative flex h-(--topbar-h) flex-none items-center px-6">
        <Brand company={tBrand("company")} product={t("brandProduct")} initials={tBrand("initials")} logo={tBrand("logo")} alwaysShowText />
        {/* After the brand link in the DOM, so the drawer's focus-on-open still lands on the brand (US-222, E3-D11). */}
        <NavClose label={t("closeNavigation")} />
      </div>
      <div className="grid flex-none gap-2 border-b border-border px-6 py-4">
        <Link
          href="/"
          data-testid="reader-all-wikis"
          className="inline-flex items-center gap-1 justify-self-start rounded-(--ds-radius-sm) text-sm/5 text-muted-foreground no-underline hover:text-foreground hover:underline [&_svg]:size-(--icon-ui) [&_svg]:flex-none"
        >
          <ArrowLeftIcon aria-hidden="true" />
          {t("allWikis")}
        </Link>
        <p data-testid="reader-wiki-name" className="m-0 flex items-center gap-2 font-bold [overflow-wrap:anywhere] [&_svg]:size-(--icon-control) [&_svg]:flex-none [&_svg]:text-muted-foreground">
          <BookIcon aria-hidden="true" />
          {wiki.name}
        </p>
        {wiki.folder === undefined ? null : (
          <p data-testid="reader-wiki-folder" className="m-0 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            <span className="wr-literal">{wiki.folder}</span>
          </p>
        )}
      </div>
      <div data-testid="reader-nav-column" className="flex min-h-0 flex-1 flex-col">
        {tree.length > 0 ? <NavTree wikiId={wikiId} tree={tree} activePath={activePath} /> : null}
      </div>
      <div className="flex-none border-t border-border p-4">
        <LocaleSwitcher
          label={tLocale("label")}
          optionLabels={{ en: tLocale("en") }}
          className="grid gap-1 text-sm/5 text-muted-foreground [&_select]:w-full [&_select]:min-w-0"
          icon={<GlobeIcon />}
        />
      </div>
    </div>
  );
}
