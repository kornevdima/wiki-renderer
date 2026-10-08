import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { DocumentTitle } from "@/components/reader/document-title-tag";
import { documentTitle } from "@/components/reader/document-title";
import { UnavailableView } from "@/components/reader/unavailable-view";

/**
 * The uniform unavailable view for `/w/*` (US-100, TC-430; R-13). Every `notFound()` the wiki page raises
 * (denied, unknown wiki, disconnected wiki, absent or invalid path) renders this ONE component, which receives
 * no params and is never given the wiki id, path or name, so the body (RSC payload included) and `<title>`
 * cannot vary by cause.
 *
 * Like the app-wide `src/app/not-found.tsx`, it replaces Next's built-in 404 UI, whose inline `<style>` carries
 * no nonce and is blocked by the nonce-only CSP (US-010). No `loading.tsx` may exist under `/w`: streaming
 * would commit a 200 before the 404.
 *
 * The tab title needs BOTH a `generateMetadata` and a hoisted body `<title>` (F-B, measured on the prod build).
 * The server-rendered head takes its title from this segment's metadata, so the raw HTML has the one heading
 * `<title>` (e2e S17 pins that). But the page exports `metadata = { title: null }`, and the metadata the CLIENT
 * resolves for a 404 comes from the layout + page chain, not from this file: it is an empty list, and hydration
 * replaced the head title with nothing, leaving `document.title === ""` (with no page metadata at all it became
 * the layout's "wiki-renderer"). A `<title>` in this component's body is part of the client tree, so hydration
 * keeps it. The page cannot drop `title: null` (it would then emit two titles beside its hoisted one), and
 * neither half can be removed without regressing the raw title or the hydrated title.
 *
 * Both halves build the same string through `documentTitle` ("<screen> · ESG Wikis", US-221) and are never given a wiki
 * name, so the title is byte-identical for every cause (SR-020).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("unavailableView");
  const tTitle = await getTranslations("documentTitle");
  // No wiki name: the title cannot vary by cause (SR-020; E3-D9).
  return { title: documentTitle({ screen: t("heading"), suffix: tTitle("suffix") }) };
}

export default function WikiNotFound() {
  const t = useTranslations("unavailableView");
  return (
    <>
      <DocumentTitle screen={t("heading")} />
      <UnavailableView kind="no-access" />
    </>
  );
}
