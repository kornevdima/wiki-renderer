import { useTranslations } from "next-intl";

import { documentTitle } from "./document-title";

/**
 * The hoisted `<title>` of a reader screen (US-221). `wiki` is passed only inside the reader shell. The string is one
 * React text child, so a name with markup is text in the raw HTML and after hydration alike.
 */
export function DocumentTitle({ screen, wiki }: { screen: string; wiki?: string }) {
  const t = useTranslations("documentTitle");
  return <title>{documentTitle({ screen, wiki, suffix: t("suffix") })}</title>;
}

/** The empty wiki's title: its heading inside the shell, so with the wiki name. The view itself draws no `<title>`. */
export function EmptyWikiTitle({ wiki }: { wiki: string }) {
  const t = useTranslations("emptyWiki");
  return <DocumentTitle screen={t("heading")} wiki={wiki} />;
}
