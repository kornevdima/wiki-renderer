import { CloudOffIcon, FileIcon, FileXIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { BareFrame } from "@/components/layout/bare-frame";
import { Panel } from "@/components/layout/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { DocumentTitle } from "./document-title-tag";

/**
 * The reader's "nothing to show" view (SA-MOD Reader UI and print §3, Amendment A3; US-100, US-102, US-103). It
 * takes ONLY a `kind` (plus, for `no-cache`, the retry href), never a reason, a wiki id, a path or a name
 * (US-100 scenario 3): the `no-access` body is therefore the same for an unknown wiki, an unlinked wiki, a
 * disconnected wiki and an absent page, byte for byte.
 *
 * - `no-access` - the uniform 404 view (R-13). Reached only through `notFound()`, i.e. through the
 *   segment-scoped `app/w/[wikiId]/not-found.tsx`, which receives no params. It renders no `<title>` itself:
 *   `not-found.tsx` hoists it, so this markup stays byte-identical to wave 7.
 * - `empty` - an allowed viewer opened a wiki with no pages (200). Rendered only AFTER the access check. It draws no
 *   `<title>`: the page hoists one that names the wiki (US-221).
 * - `no-cache` - the retry screen (US-102): no snapshot could be served. 200 + `noindex` (R-15). "Try again" is a
 *   plain link to the URL the viewer asked for (Y8-4).
 *
 * Copy: `messages/en.json` `unavailableView.*` / `emptyWiki.*` / `retryView.*` (R-12, accepted verbatim).
 *
 * Look (US-195, US-221): each is the kit's full `EmptyState` (icon, `<h1>` at the kit's `title` size) inside a flush `Panel`. `no-cache` and `no-access` sit in the
 * `BareFrame` (slim brand bar, no shell), `max-w-(--modal-w)`; `empty` sits inside the reader shell. Retry has a solid "Try again"
 * and an outline "Back to your wikis"; no-access has the one solid "Back to your wikis".
 */
export type UnavailableViewProps =
  | { kind: "no-access" | "empty" }
  | { kind: "no-cache"; retryHref: string };

/** The card width of the bare screens (the empty view sits in the reader column instead). */
const CARD = "w-full max-w-(--modal-w)";

export function UnavailableView(props: UnavailableViewProps) {
  const tUnavailable = useTranslations("unavailableView");
  const tEmpty = useTranslations("emptyWiki");
  const tRetry = useTranslations("retryView");
  const tBrand = useTranslations("brand");
  const tShell = useTranslations("readerShell");
  const brand = { company: tBrand("company"), product: tShell("brandProduct"), initials: tBrand("initials"), logo: tBrand("logo") };

  const back = (variant: "solid" | "outline") => (
    <Button asChild variant={variant} size="sm">
      <Link href="/" data-testid="unavailable-back">
        {tUnavailable("backLink")}
      </Link>
    </Button>
  );

  if (props.kind === "empty") {
    return (
      <Panel flush>
        <EmptyState
          data-testid="wiki-empty-view"
          icon={<FileIcon />}
          title={tEmpty("heading")}
          titleAs="h1"
          text={tEmpty("description")}
        />
      </Panel>
    );
  }

  if (props.kind === "no-cache") {
    return (
      <BareFrame brand={brand} testId="unavailable-view" kind="no-cache">
        <DocumentTitle screen={tRetry("heading")} />
        <Panel flush className={CARD}>
          <EmptyState
            icon={<CloudOffIcon />}
            title={tRetry("heading")}
            titleAs="h1"
            text={tRetry("description")}
            actions={
              <>
                <Button asChild variant="solid" size="sm">
                  <a href={props.retryHref} data-testid="unavailable-retry">
                    <RefreshCwIcon aria-hidden="true" />
                    {tRetry("action")}
                  </a>
                </Button>
                {back("outline")}
              </>
            }
          />
        </Panel>
      </BareFrame>
    );
  }

  return (
    <BareFrame brand={brand} testId="unavailable-view">
      <Panel flush className={CARD}>
        <EmptyState
          icon={<FileXIcon />}
          title={tUnavailable("heading")}
          titleAs="h1"
          text={tUnavailable("description")}
          actions={back("solid")}
        />
      </Panel>
    </BareFrame>
  );
}
