import { useTranslations } from "next-intl";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import type { Crumb } from "@/components/layout/breadcrumbs-view-model";

import { PdfBrowserHint } from "./pdf-browser-hint";
import { SaveAsPdfButton } from "./save-as-pdf-button";
import { SourceControls } from "./source-controls";
import type { PageShellProps } from "./page-shell";

/**
 * The page bar (US-188, FR-052, FR-044, FR-047; the reader mockup's `.wr-pagebar`): one row above the article with the
 * breadcrumbs on the left and the page's actions on the right, wrapping on a narrow screen. Page view: View source, Save as PDF
 * with its status line, and the Chrome hint (shown after mount, outside Chromium only). Source view: View page, Copy,
 * Download .md; no Save as PDF and no hint. All of it is chrome and is hidden in print.
 *
 * `PageShell` renders it only for an open page, so the empty wiki has no page bar at all. The breadcrumb trail is built by
 * `buildPageCrumbs` from the tree the page already holds. The actions group keeps `data-testid="reader-page-actions"`.
 */
export interface PageBarProps {
  crumbs: readonly Crumb[];
  sourceControls: PageShellProps["sourceControls"];
  diagramCount: number;
  viewKey: string;
}

export function PageBar({ crumbs, sourceControls, diagramCount, viewKey }: PageBarProps) {
  const tCrumbs = useTranslations("breadcrumbs");
  const tPdf = useTranslations("pdf");
  const inSource = sourceControls?.mode === "source";
  return (
    <div className="wr-pagebar flex flex-wrap items-center justify-between gap-x-4 gap-y-3 print:hidden" data-testid="reader-pagebar">
      <div className="min-w-0 flex-[1_1_280px]">
        <Breadcrumbs label={tCrumbs("label")} crumbs={crumbs} />
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="reader-page-actions">
        <SourceControls controls={sourceControls} />
        {inSource ? null : (
          <>
            <SaveAsPdfButton diagramCount={diagramCount} viewKey={viewKey} copy={{ button: tPdf("button"), preparing: tPdf("preparing") }} />
            <PdfBrowserHint text={tPdf("chromeHint")} />
          </>
        )}
      </div>
    </div>
  );
}
