import messages from "../../../messages/en.json";

/**
 * The server-rendered Mermaid caption (US-104, W2-6). The copy lives in `messages/en.json` (operator R-7); the content
 * layer is English-only, sync and viewer-free (the render cache key carries no locale), so it reads the same JSON
 * file the client component's `useTranslations` reads instead of going through the request-scoped next-intl API.
 */
export const MERMAID_CAPTION: string = messages.mermaid.caption;
