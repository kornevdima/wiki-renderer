import messages from "../../../messages/en.json";

/**
 * The accepted copy of the unavailable marker and the embed limit markers (US-081, US-083; operator R-7, verbatim).
 * It lives in `messages/en.json` and reaches the content layer the way `mermaid-copy.ts` does: the content layer is
 * English-only, sync and viewer-free (the render cache key carries no locale), so it reads the same JSON file.
 */
export const UNAVAILABLE_LABEL: string = messages.wikilinks.unavailableLabel;
export const UNAVAILABLE_TOOLTIP: string = messages.wikilinks.unavailableTooltip;
export const EMBED_CYCLE_COPY: string = messages.wikilinks.embedCycle;
export const EMBED_DEPTH_COPY: string = messages.wikilinks.embedDepth;
export const EMBED_BUDGET_COPY: string = messages.wikilinks.embedBudget;
/** US-085 (R-7, verbatim): the visually hidden text of an external link, beside its CSS icon. */
export const EXTERNAL_NEW_TAB_COPY: string = messages.wikilinks.externalNewTab;
/** US-084 (R-7, verbatim): the visible text of an unavailable image. */
export const IMAGE_UNAVAILABLE_COPY: string = messages.wikilinks.imageUnavailable;
