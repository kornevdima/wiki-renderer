import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * `next-intl` per-request configuration (ADR-018).
 *
 * English only, no i18n routing (no `/en/...` prefix, no `middleware.ts` /
 * `proxy.ts`, no `defineRouting`): the locale is always `DEFAULT_LOCALE`.
 * There is no session, cookie or `Accept-Language` lookup here — unlike
 * outreach's per-user `users.locale` session field, there is nothing to
 * select between yet (`LOCALES` has one entry), and adding that lookup now
 * would let a second locale's messages leak in without a code change, which
 * is exactly what US-002's third acceptance scenario rules out.
 */
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
