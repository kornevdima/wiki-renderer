import { CodeIcon, DownloadIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CopySourceButton } from "./copy-source-button";
import type { PageShellProps } from "./page-shell";

/**
 * The header's source-view controls (US-161, D2), split out of `PageShell` so the shell's own source keeps its one
 * pinned `href` (the All wikis link, US-096). Page view: "View source". Source view: "View page", "Copy",
 * "Download .md". All of it is chrome, hidden in print, and each control is an outline `sm` button (US-188). Renders nothing on the landing and empty views.
 */
const OUTLINE_SM = cn(buttonVariants({ variant: "outline", size: "sm" }), "print:hidden");

export function SourceControls({ controls }: { controls: PageShellProps["sourceControls"] }) {
  const t = useTranslations("source");
  if (controls === undefined) return null;
  if (controls.mode === "page") {
    return (
      <Link href={controls.sourceHref} data-testid="source-view-link" className={OUTLINE_SM}>
        <CodeIcon aria-hidden="true" />
        {t("viewSource")}
      </Link>
    );
  }
  return (
    <>
      <Link href={controls.pageHref} data-testid="source-page-link" className={OUTLINE_SM}>
        <FileTextIcon aria-hidden="true" />
        {t("viewPage")}
      </Link>
      <CopySourceButton text={controls.text} copy={{ copy: t("copy"), label: t("copyLabel"), copied: t("copied") }} />
      <a href={controls.downloadHref} download data-testid="source-download" className={OUTLINE_SM}>
        <DownloadIcon aria-hidden="true" />
        {t("download")}
      </a>
    </>
  );
}
