/**
 * US-282: where to scroll the popover's list so the current entry is in view when it opens. Pure, so a unit test pins it.
 * All numbers are in the same unit (px): the list's and the entry's tops are viewport coordinates (`getBoundingClientRect().top`),
 * `scrollTop` is the list's current scroll offset. An entry already fully inside the list leaves the offset alone; one outside it is
 * centred, clamped to the list's scrollable range.
 */
export function revealScrollTop(input: { listTop: number; listHeight: number; itemTop: number; itemHeight: number; scrollTop: number; scrollHeight: number }): number {
  const { listTop, listHeight, itemTop, itemHeight, scrollTop, scrollHeight } = input;
  const rel = itemTop - listTop;
  if (rel >= 0 && rel + itemHeight <= listHeight) return scrollTop;
  const centred = scrollTop + rel - (listHeight - itemHeight) / 2;
  return Math.min(Math.max(0, centred), Math.max(0, scrollHeight - listHeight));
}
