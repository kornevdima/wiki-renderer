import { InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppSettingsMenu } from "@/components/app-settings-menu";
import { brandProps } from "@/components/brand-props";
import { Brand } from "@/components/layout/brand";
import { MAIN_REGION, PAGE_CONTENT_CLASS } from "@/components/layout/main-region";
import { PageHeader } from "@/components/layout/page-header";
import { Topbar } from "@/components/layout/topbar";
import { documentTitle } from "@/components/reader/document-title";
import { PrintSetting } from "@/components/settings/print-setting";
import { SettingsWikis } from "@/components/settings/settings-wikis";
import { Alert } from "@/components/ui/alert";
import { getWikiList, printFileTitle } from "@/content/runtime";
import { readUserConfig, type StoredWiki } from "@/content/runtime/user-config";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  const tTitle = await getTranslations("documentTitle");
  return { title: documentTitle({ screen: t("title"), suffix: tTitle("suffix") }) };
}

/**
 * `/settings` (US-277): the wiki list and the print setting. The list is the config file as written (folders keep their
 * `~`), read fresh; when `WIKI_DIRS` manages the list, or the file is bad, it is shown read-only with the reason.
 */
export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const tBrand = await getTranslations("brand");
  const list = getWikiList();

  let wikis: readonly StoredWiki[] = list.wikis;
  let fileError: string | undefined;
  if (!list.managedByEnv) {
    try {
      wikis = (await readUserConfig(list.configPath)).wikis;
    } catch (error) {
      fileError = error instanceof Error ? error.message : String(error);
    }
  }
  const readOnly = list.managedByEnv || fileError !== undefined;

  return (
    <div data-testid="app-shell">
      <Topbar leading={<Brand {...brandProps({ company: tBrand("company"), product: tBrand("product"), initials: tBrand("initials"), logo: tBrand("logo"), tone: tBrand("tone") })} />}>
        <AppSettingsMenu />
      </Topbar>
      <main {...MAIN_REGION} className={PAGE_CONTENT_CLASS}>
        <PageHeader title={t("title")} meta={[{ text: t("tagline") }]} />
        {list.managedByEnv ? (
          <Alert variant="info" icon={InfoIcon} title={t("env.title")} data-testid="env-notice">
            <p className="m-0">{t("env.text")}</p>
          </Alert>
        ) : null}
        {fileError ? (
          <Alert variant="danger" title={t("configError.title")} data-testid="config-error">
            <p className="m-0 [overflow-wrap:anywhere]">{t("configError.text", { message: fileError })}</p>
          </Alert>
        ) : null}
        <SettingsWikis wikis={wikis} readOnly={readOnly} />
        <PrintSetting
          checked={printFileTitle()}
          envManaged={env.WIKI_PRINT_FILE_TITLE !== undefined}
        />
      </main>
    </div>
  );
}
