"use client";

import { InfoIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { shouldShowPdfHint } from "./save-as-pdf-state";

/**
 * The non-Chrome hint (US-107, TC-485). Shown after mount only: the server snapshot and the first client render are
 * `false`, so nothing is emitted during server rendering and hydration cannot mismatch. It never disables the button.
 */
const noopSubscribe = () => () => {};

export function PdfBrowserHint({ text }: { text: string }) {
  const show = useSyncExternalStore(
    noopSubscribe,
    () => shouldShowPdfHint(navigator.userAgent),
    () => false,
  );
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground print:hidden" data-testid="pdf-browser-hint">
      <InfoIcon aria-hidden="true" className="size-(--icon-ui) flex-none" />
      {text}
    </span>
  );
}
