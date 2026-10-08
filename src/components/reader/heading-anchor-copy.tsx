"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { MAIN_REGION_ID } from "@/components/layout/main-region";

import { ANCHOR_CUE_MS, anchorUrl, copyLink } from "./copy-link";

/**
 * The heading anchors' behaviour (US-219, FR-053, SA-MOD Reader UI and print E3-3, E3-D12). A client island that `PageShell`
 * mounts once on a page that has anchors. It renders only the live region, which is always present (a region inserted with its
 * text may not be announced), and attaches ONE delegated `click` listener on the page's `<main>` for `a.heading-anchor`.
 *
 * It does NOT `preventDefault`: the fragment navigation proceeds, so the address bar shows the section and the link behaves the
 * same with no script. The copied address is the page address with the anchor's fragment (`anchorUrl`), read before the click's
 * default action runs. The result comes from `copyLink` (`navigator.clipboard.writeText` only, no `execCommand`). For two
 * seconds the anchor carries `data-state="copied"` (a tick) or `"failed"` (a danger icon), set on the RSC-rendered node, which
 * React never re-renders in a page view, and the live region reads "Link copied" or "Couldn't copy the link". Only one anchor
 * carries a state at a time. A repeat activation restarts the window and re-announces: the text is cleared, then set on the next
 * frame, so identical text is announced again. The listener and the timers are removed in cleanup, so nothing stacks.
 */
export function HeadingAnchorCopy() {
  const t = useTranslations("headingAnchor");
  const copiedText = t("copied");
  const failedText = t("failed");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const main = document.getElementById(MAIN_REGION_ID);
    if (main === null) return;
    let latest = 0;
    let cued: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const clearCue = () => {
      cued?.removeAttribute("data-state");
      cued = null;
    };
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a.heading-anchor") : null;
      if (anchor === null || !main.contains(anchor)) return;
      const url = anchorUrl(window.location.href, anchor.getAttribute("href") ?? "");
      const mine = ++latest;
      void copyLink(url, typeof navigator === "undefined" ? undefined : navigator.clipboard).then((result) => {
        if (mine !== latest) return;
        clearCue();
        anchor.setAttribute("data-state", result);
        cued = anchor;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        setMessage("");
        frame = requestAnimationFrame(() => setMessage(result === "copied" ? copiedText : failedText));
        timer = setTimeout(() => {
          clearCue();
          setMessage("");
        }, ANCHOR_CUE_MS);
      });
    };

    main.addEventListener("click", onClick);
    return () => {
      main.removeEventListener("click", onClick);
      latest++;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      clearCue();
    };
  }, [copiedText, failedText]);

  return (
    <p role="status" aria-live="polite" data-testid="anchor-status" className="sr-only print:hidden">
      {message}
    </p>
  );
}
