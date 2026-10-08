import messages from "../../../messages/en.json";

/**
 * The accessible name of a heading anchor (US-219, SA-MOD Rendering pipeline E3-A1). The copy lives in `messages/en.json` and
 * the content layer is English-only, sync and viewer-free (the render cache key carries no locale), so it reads the same JSON
 * file the client's `useTranslations` reads, as `mermaid-copy.ts` does. The name is `Copy link to "<heading>"` (ruled
 * 2026-10-07, mockup `src.html:713`) and the heading text is never cut. The text goes in through a replacer function, so a `$`
 * in a heading is never read as a replacement pattern.
 */
const LABEL_TEMPLATE: string = messages.headingAnchor.label;

export function headingAnchorLabel(headingText: string): string {
  return LABEL_TEMPLATE.replace("{heading}", () => headingText);
}
