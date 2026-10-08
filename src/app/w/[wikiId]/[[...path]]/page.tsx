import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";

import { DocumentTitle, EmptyWikiTitle } from "@/components/reader/document-title-tag";
import { diagramSetKey } from "@/components/reader/diagram-set-key";
import { MermaidHydrator } from "@/components/reader/mermaid-hydrator";
import { OnThisPage } from "@/components/reader/on-this-page";
import { showsOutline } from "@/components/reader/outline-tree";
import { PageMeta } from "@/components/reader/page-meta";
import { PageShell } from "@/components/reader/page-shell";
import { UnavailableView } from "@/components/reader/unavailable-view";
import { emitServerTiming, nowMs } from "@/components/reader/render-timing";
import { decodeSource, isSourceView, sourceDownloadUrl, sourceViewHref } from "@/components/reader/source-view";
import { SourceView } from "@/components/reader/source-view-body";
import { readerWikiFor } from "@/components/reader/reader-wiki";
import { isStaleNoticeDue } from "@/components/reader/stale-notice-format";
import {
  bodyStartsWithH1,
  pageHref,
  pickLanding,
  requestedHref,
  resolveRequestedPath,
} from "@/components/reader/wiki-path";
import { renderPage } from "@/content/render/render";
import { findWiki, getSnapshot } from "@/content/runtime";
import type { SnapshotResult } from "@/content/runtime/types";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

/**
 * `WikiPage`: one page of a configured wiki, its landing redirect, or its source view.
 *
 *  1. The wiki id must be one of `WIKI_DIRS` (`findWiki`), else `notFound()`.
 *  2. Path safety (`resolveRequestedPath`): invalid -> `notFound()`.
 *  3. `getSnapshot` (a rejection is treated like `unavailable`): `unavailable` -> the retry screen (200); `stale` past
 *     `WIKI_SNAPSHOT_STALE_NOTICE_MS` -> the page plus the notice.
 *  4. Landing (first page in tree order), `?view=source`, or `renderPage`, synchronously after step 3's await.
 *
 * `params.path` arrives percent-ENCODED and `resolveRequestedPath` decodes it exactly once. The tab `<title>` is set by
 * a React 19 hoisted `<title>` so no second `getSnapshot` call (`generateMetadata`) is needed.
 */
export const metadata: Metadata = { title: null };

export default async function WikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ wikiId: string; path?: string[] }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const startedAt = nowMs();
  // 1
  const { wikiId, path: rawPath } = await params;
  const { view } = await searchParams;
  const local = findWiki(wikiId);
  if (local === undefined) notFound();
  const wiki = readerWikiFor(local);

  // 2
  const requested = resolveRequestedPath(rawPath);
  if (requested.kind === "invalid") notFound();

  // 3
  let result: SnapshotResult | null = null;
  try {
    result = await getSnapshot(wikiId);
  } catch {
    log.child({ wikiId }).error("reader.snapshot_failed");
  }

  // The retry screen carries nothing from a snapshot.
  if (result === null || result.state === "unavailable") {
    return <UnavailableView kind="no-cache" retryHref={requestedHref(wikiId, requested)} />;
  }
  if (result.state === "not_connected") notFound();
  const { snapshot } = result;
  const stale =
    result.state === "stale" &&
    isStaleNoticeDue(result.staleSince, new Date(), env.WIKI_SNAPSHOT_STALE_NOTICE_MS)
      ? { since: result.staleSince }
      : undefined;

  if (requested.kind === "landing") {
    const landing = pickLanding(new Set(snapshot.pages.keys()), snapshot.tree);
    if (landing !== null) redirect(pageHref(wikiId, landing));
    return (
      <PageShell wikiId={wikiId} wiki={wiki} sha={snapshot.sha} tree={snapshot.tree} activePath={null} stale={stale}>
        <EmptyWikiTitle wiki={wiki.name} />
        <UnavailableView kind="empty" />
      </PageShell>
    );
  }

  // 4 — `?view=source` is a mode of this page: the same snapshot and notice above, the snapshot's own bytes for the
  // file, no second read. A path with no page is the same `notFound()` as the page.
  if (isSourceView(view)) {
    const parsed = snapshot.pages.get(requested.path);
    const file = parsed === undefined ? undefined : snapshot.files.get(requested.path);
    if (parsed === undefined || file === undefined) notFound();
    const text = decodeSource(file.bytes);
    return (
      <PageShell
        wikiId={wikiId}
        wiki={wiki}
        sha={snapshot.sha}
        tree={snapshot.tree}
        activePath={requested.path}
        pageTitle={parsed.title}
        stale={stale}
        sourceControls={{
          mode: "source",
          pageHref: pageHref(wikiId, requested.path),
          downloadHref: sourceDownloadUrl(wikiId, snapshot.sha, requested.path),
          text,
        }}
      >
        <DocumentTitle screen={parsed.title} wiki={wiki.name} />
        <h1 className="wr-source-title">{parsed.title}</h1>
        <SourceView text={text} />
      </PageShell>
    );
  }

  const rendered = renderPage(snapshot, requested.path);
  if ("state" in rendered) notFound();

  const ast = snapshot.pages.get(requested.path)?.ast;
  const showTitleHeading = ast === undefined || !bodyStartsWithH1(ast);

  // The server phase, written only here, on the rendered-page return.
  emitServerTiming(log, "rendered", wikiId, startedAt, nowMs());

  return (
    <PageShell wikiId={wikiId} wiki={wiki} sha={snapshot.sha} tree={snapshot.tree} activePath={requested.path} pageTitle={rendered.title} stale={stale} sourceControls={{ mode: "page", sourceHref: sourceViewHref(wikiId, requested.path) }} frontmatter={rendered.frontmatterView} outline={rendered.outline} diagramCount={rendered.mermaidBlocks.length} viewKey={diagramSetKey(rendered.path, rendered.mermaidBlocks)}>
      <DocumentTitle screen={rendered.title} wiki={wiki.name} />
      {/* US-220: the meta line follows the page's h1, the injected title or the body's own leading h1 (`leadHeading`). */}
      <Fragment key={rendered.path}>
        {showTitleHeading ? <h1>{rendered.title}</h1> : rendered.leadHeading}
        <PageMeta fields={rendered.frontmatterView} />
        {/* US-219: the folded "On this page" list, under the meta line; the rail's copy is `PageShell`'s. CSS shows one per width. */}
        {showsOutline(rendered.outline) ? <OnThisPage outline={rendered.outline} variant="folded" /> : null}
        {showTitleHeading || !rendered.leadHeading ? rendered.content : rendered.body}
      </Fragment>
      <MermaidHydrator pageKey={rendered.path} blocks={rendered.mermaidBlocks} />
    </PageShell>
  );
}
