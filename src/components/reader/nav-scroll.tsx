"use client";

import { useEffect } from "react";

import { treeScrollTop } from "./scroll-offset";

/**
 * Scrolls the page tree to the current page whenever a page opens (US-219, FR-052 amendment 2026-10-07, SA-MOD Reader UI and
 * print E3-4). Renders nothing; `NavTree` (a server component) mounts it inside the nav. The effect is keyed on `activePath`, so
 * it fires on first load and on in-wiki navigation to another page, not on a re-render of the same one.
 *
 * It sets the nav's OWN `scrollTop` (`treeScrollTop` decides, from two bounding rects), never `scrollIntoView`, so the window
 * does not move. It does nothing when the link is already inside the nav, when it has no box (a folder the reader closed by
 * hand), or when there is no current link (the empty view, a page that is not in the tree). No smooth scrolling, so
 * `prefers-reduced-motion` needs no branch. In the off-canvas drawer the translate moves nav and link together, so the
 * difference of the two rects is unaffected.
 */
export function NavScroll({ activePath }: { activePath: string | null }) {
  useEffect(() => {
    if (activePath === null) return;
    const frame = requestAnimationFrame(() => {
      const nav = document.querySelector<HTMLElement>('[data-testid="reader-nav"]');
      const link = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!nav || !link) return;
      const navBox = nav.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();
      const next = treeScrollTop({
        navTop: navBox.top,
        navHeight: nav.clientHeight,
        navScrollTop: nav.scrollTop,
        navScrollHeight: nav.scrollHeight,
        linkTop: linkBox.top,
        linkHeight: linkBox.height,
      });
      if (next !== null) nav.scrollTop = next;
    });
    return () => cancelAnimationFrame(frame);
  }, [activePath]);
  return null;
}
