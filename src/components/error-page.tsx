"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { BareFrame } from "@/components/layout/bare-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The page shown when a screen fails to render (US-205, NFR-013): the US-195 bare frame (slim brand bar, one `<main>`) around a
 * full EmptyState with a warning icon, the `<h1>`, one line of body, a solid "Try again" and an outline "Back to your wikis", a plain anchor (a full navigation home), because inside `global-error` the root layout and its router may be gone.
 * Shared by `app/error.tsx` (inside the root layout) and `app/global-error.tsx` (its own `<html>`).
 *
 * Nothing about the failure is rendered: it takes no error, message, stack or digest, so none can reach the HTML (the server
 * still logs the error as before). "Try again" runs the caller's `onRetry` (`error.tsx`: `retrySegment`; `global-error.tsx`: a full reload). Copy:
 * `messages/en.json` `errorPage.*`, `retryView.action` and `unavailableView.backLink`.
 */
export function ErrorPage({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("errorPage");
  const tRetry = useTranslations("retryView");
  const tUnavailable = useTranslations("unavailableView");
  const tBrand = useTranslations("brand");
  const tShell = useTranslations("readerShell");
  const brand = { company: tBrand("company"), product: tShell("brandProduct") };

  return (
    <BareFrame brand={brand} testId="error-page">
      <title>{t("heading")}</title>
      <EmptyState
        className="w-full max-w-(--modal-w)"
        icon={<TriangleAlertIcon />}
        title={t("heading")}
        titleAs="h1"
        titleClassName="text-[28px]/9"
        text={t("description")}
        actions={
          <>
            <Button type="button" variant="solid" size="sm" onClick={() => onRetry()} data-testid="error-page-retry">
              <RefreshCwIcon aria-hidden="true" />
              {tRetry("action")}
            </Button>
            <Button asChild variant="outline" size="sm">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full navigation on purpose: no router inside global-error */}
              <a href="/" data-testid="error-page-back">
                {tUnavailable("backLink")}
              </a>
            </Button>
          </>
        }
      />
    </BareFrame>
  );
}
