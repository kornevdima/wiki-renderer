import { BookIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Brand } from "@/components/layout/brand";
import { MAIN_REGION, PAGE_CONTENT_CLASS } from "@/components/layout/main-region";
import { PageHeader } from "@/components/layout/page-header";
import { Topbar } from "@/components/layout/topbar";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { documentTitle } from "@/components/reader/document-title";
import { ThemeControl } from "@/components/theme-control";
import { listWikis } from "@/content/runtime";

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
  const wikis = listWikis();
  if (wikis.length === 1) redirect(`/w/${wikis[0]!.id}`);

  const t = await getTranslations("home");
  const tListing = await getTranslations("homeListing");
  const tBrand = await getTranslations("brand");
  const tLocale = await getTranslations("localeSwitcher");

  return (
    <div data-testid="app-shell">
      <Topbar leading={<Brand company={tBrand("company")} product={tBrand("product")} initials={tBrand("initials")} logo={tBrand("logo")} />}>
        <LocaleSwitcher label={tLocale("label")} optionLabels={{ en: tLocale("en") }} />
        <ThemeControl />
      </Topbar>
      <main {...MAIN_REGION} className={PAGE_CONTENT_CLASS}>
        <PageHeader title={t("heading")} meta={[{ text: t("tagline") }]} />
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
      </main>
    </div>
  );
}
