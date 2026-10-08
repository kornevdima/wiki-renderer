import { COPIED_REVERT_MS, copyText } from "./copy-source-state";

/**
 * Heading-anchor copy (US-219, FR-053, SA-MOD Reader UI and print E3-3, E3-D12; TC-506). Pure: the clipboard is a parameter.
 *
 * `copyLink` resolves `"copied"` only when `navigator.clipboard.writeText` resolves, and `"failed"` for everything else: no
 * clipboard object (an insecure context), a `writeText` that throws, one that rejects. It never throws, and there is no
 * `execCommand` fallback (ruled). `anchorUrl` is the page address with its own fragment replaced by the anchor's, so a `?view=`
 * query is never copied from the source view and an existing hash never doubles.
 */
export type CopyLinkResult = "copied" | "failed";

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/** How long the tick or danger icon stays on the anchor (ruled: 2 s, alongside the announcement). The same two seconds as the source "Copy". */
export const ANCHOR_CUE_MS = COPIED_REVERT_MS;

export async function copyLink(url: string, clipboard: ClipboardLike | undefined | null): Promise<CopyLinkResult> {
  return (await copyText(url, clipboard ?? undefined)) ? "copied" : "failed";
}

/** The address to copy: `pageHref` (e.g. `location.href`) without its hash, plus the anchor's `href` (`#user-content-…`). */
export function anchorUrl(pageHref: string, anchorHref: string): string {
  const hashAt = pageHref.indexOf("#");
  const base = hashAt === -1 ? pageHref : pageHref.slice(0, hashAt);
  return `${base}${anchorHref.startsWith("#") ? anchorHref : `#${anchorHref}`}`;
}
