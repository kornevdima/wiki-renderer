/**
 * Where the page tree should scroll so the current page's link is in view (US-219, FR-052 amendment 2026-10-07, SA-MOD Reader UI
 * and print E3-4; TC-510). Pure: the caller passes the numbers it read from the DOM (`getBoundingClientRect` of the nav and of the
 * link, the nav's `clientHeight`, `scrollTop` and `scrollHeight`) and sets the answer on the nav's OWN `scrollTop`, never
 * `scrollIntoView`, which scrolls every ancestor including the window.
 *
 * Returns the new `scrollTop`, or `null` for "leave it": a link that is already fully inside the nav's visible box (so a short
 * tree never scrolls), a link with no box (a closed folder or a hidden nav lays it out at zero), a nav that cannot scroll, or
 * any input that is not a finite number. A number it returns is finite and inside `[0, scrollHeight - clientHeight]`, and it
 * differs from the current one. The link is centred, as the accepted mockup does.
 */
export interface TreeScrollInput {
  /** `nav.getBoundingClientRect().top` */
  navTop: number;
  /** `nav.clientHeight` */
  navHeight: number;
  /** `nav.scrollTop` */
  navScrollTop: number;
  /** `nav.scrollHeight` */
  navScrollHeight: number;
  /** `link.getBoundingClientRect().top` */
  linkTop: number;
  /** `link.getBoundingClientRect().height` */
  linkHeight: number;
}

export function treeScrollTop(input: TreeScrollInput): number | null {
  const { navTop, navHeight, navScrollTop, navScrollHeight, linkTop, linkHeight } = input;
  if (![navTop, navHeight, navScrollTop, navScrollHeight, linkTop, linkHeight].every(Number.isFinite)) return null;
  if (navHeight <= 0 || linkHeight <= 0) return null;
  const maxScroll = navScrollHeight - navHeight;
  if (maxScroll <= 0) return null;
  const inside = linkTop >= navTop && linkTop + linkHeight <= navTop + navHeight;
  if (inside) return null;
  const centred = navScrollTop + (linkTop - navTop) - navHeight / 2 + linkHeight / 2;
  const next = Math.min(Math.max(centred, 0), maxScroll);
  return next === navScrollTop ? null : next;
}
