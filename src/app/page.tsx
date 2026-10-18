import { BookIcon, LibraryBigIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { brandProps } from "@/components/brand-props";
import { Brand } from "@/components/layout/brand";
import { MAIN_REGION, PAGE_CONTENT_CLASS } from "@/components/layout/main-region";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Topbar } from "@/components/layout/topbar";
import { AppSettingsMenu } from "@/components/app-settings-menu";
import { documentTitle } from "@/components/reader/document-title";
import { getWikiList } from "@/content/runtime";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  const tTitle = await getTranslations("documentTitle");
  return { title: documentTitle({ screen: t("heading"), suffix: tTitle("suffix") }) };
}

/**
 * `/`: with one configured wiki, straight to it; with several, a list of them (name and folder). Nothing here builds a
 * snapshot, so the listing is instant however large the vaults are.
 */
export default async function Home() {
  const { wikis, error, configPath } = getWikiList();
  if (wikis.length === 1 && !error) redirect(`/w/${wikis[0]!.id}`);

  const t = await getTranslations("home");
  const tListing = await getTranslations("homeListing");
  const tBrand = await getTranslations("brand");

  return (
    <div data-testid="app-shell">
      <Topbar leading={<Brand {...brandProps({ company: tBrand("company"), product: tBrand("product"), initials: tBrand("initials"), logo: tBrand("logo"), tone: tBrand("tone") })} />}>
        <AppSettingsMenu />
      </Topbar>
      <main {...MAIN_REGION} className={PAGE_CONTENT_CLASS}>
        <PageHeader title={t("heading")} meta={[{ text: t("tagline") }]} />
        {error ? (
          <Alert variant="danger" title={t("errorTitle")} data-testid="config-error">
            <p className="m-0 [overflow-wrap:anywhere]">{error}</p>
            {wikis.length > 0 ? <p className="m-0 mt-1">{t("errorKeep")}</p> : null}
          </Alert>
        ) : null}
        {wikis.length === 0 && !error ? (
          <EmptyState
            data-testid="no-wikis"
            icon={<LibraryBigIcon />}
            title={t("emptyTitle")}
            titleAs="h2"
            text={t("emptyText")}
            detail={<span data-testid="config-path">{configPath}</span>}
          />
        ) : null}
        {wikis.length > 0 ? (
        <section aria-labelledby="wiki-list-heading" className="grid gap-3">
          <h2 id="wiki-list-heading" className="m-0 text-base font-semibold">
            {tListing("heading")}
          </h2>
          <ul data-testid="wiki-list" className="m-0 grid list-none gap-2 p-0">
            {wikis.map((wiki) => (
              <li key={wiki.id} className="rounded-(--ds-radius-md) border border-border bg-card p-4">
                <Link
                  href={`/w/${wiki.id}`}
                  className="inline-flex items-center gap-2 font-semibold text-foreground no-underline hover:underline [&_svg]:size-(--icon-control) [&_svg]:text-muted-foreground"
                >
                  <BookIcon aria-hidden="true" />
                  {wiki.name}
                </Link>
                <p className="m-0 mt-1 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="wr-literal">{wiki.root}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
        ) : null}
      </main>
    </div>
  );
}
