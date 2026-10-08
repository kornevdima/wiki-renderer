/**
 * Where keyboard focus goes after a search result is chosen (US-109, TC-486, TC-309). Radix returns focus to the
 * trigger when the dialog closes, but a chosen result navigates: on another page the trigger is gone (the shell is
 * rendered per page), so focus fell to `body`, and on the same page it sat on the trigger instead of the heading the
 * result names. After a result, focus belongs to the target heading (the fragment id) or, with no fragment or a
 * heading the page no longer has, to the content region `main`.
 *
 * Plain DOM, no React: the new page's shell is a new component instance, so the wait for the navigation to commit
 * runs from the module and survives the unmount. Escape and Close return focus to the trigger as before (flow f S14).
 */
export interface ResultFocusTarget {
  /** `location.pathname` once the navigation has committed (percent-encoded, as the browser reports it). */
  pathname: string;
  /** The heading id from the href's fragment, or `""` for a result with none. */
  fragment: string;
}

export function parseResultHref(href: string): ResultFocusTarget {
  const url = new URL(href, "http://result.invalid");
  let fragment = url.hash.slice(1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // A malformed escape: use the raw text; no element will match and focus falls back to main.
  }
  return { pathname: url.pathname, fragment };
}

const MAIN_SELECTOR = 'main[data-testid="reader-content"]';
/** Frames to wait for the target after the path matches before settling for `main`; and the overall cap (about 3 s at 60 fps). */
const FALLBACK_AFTER_FRAMES = 30;
const GIVE_UP_AFTER_FRAMES = 180;

function focusElement(el: HTMLElement): void {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/** The frame of the loop in flight, so a newer call (a second result chosen quickly) cancels the older one. */
let pendingFrame: number | null = null;

/** Cancels the loop in flight, if any (also used by tests). */
export function cancelResultFocus(): void {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
}

export function focusResultTarget(href: string): void {
  cancelResultFocus();
  const { pathname, fragment } = parseResultHref(href);
  let frames = 0;
  const tick = (): void => {
    pendingFrame = null;
    frames += 1;
    if (window.location.pathname === pathname) {
      const heading = fragment === "" ? null : document.getElementById(fragment);
      const main = document.querySelector<HTMLElement>(MAIN_SELECTOR);
      const target = heading ?? (fragment === "" || frames >= FALLBACK_AFTER_FRAMES ? main : null);
      if (target !== null) {
        focusElement(target);
        return;
      }
    }
    if (frames < GIVE_UP_AFTER_FRAMES) pendingFrame = requestAnimationFrame(tick);
  };
  pendingFrame = requestAnimationFrame(tick);
}
