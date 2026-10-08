import { getTranslations } from "next-intl/server";

import { NotFoundView } from "@/components/not-found-view";

/**
 * The app-wide `not-found.js` (US-120 contract, found while proving S2a on
 * the prod build): Next's own built-in default 404 UI injects an inline
 * `<style>` that follows `prefers-color-scheme` (per Next's docs: "The
 * default not found UI follows the operating system's color scheme...") —
 * that inline style carries no nonce, so this app's nonce-only CSP
 * (US-010, `src/proxy.ts`) blocks it, which `console-clean.ts`'s strict
 * prod-build assertion then catches (measured: `npm run
 * test:e2e-prod-image`/CI's `E2E` step, never dev — same class of gap as
 * the dev-only Fast Refresh noise `console-clean.ts` already scopes out,
 * but this one *does* reproduce on a real production build, so it needs a
 * real fix, not a scope-out).
 *
 * A custom `app/not-found.tsx` (rendered inside the existing root layout —
 * no `global-not-found.js` needed, this app has one root layout) replaces
 * Next's built-in fallback entirely, so no un-nonced inline style is ever
 * injected. Reached by every `notFound()` call in the tree — `web/src/app/
 * admin/layout.tsx`'s O2 guard included — and by any genuinely unmatched
 * route. US-178 restyled the body (`NotFoundView`: the sign-in column, a full EmptyState).
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const tBrand = await getTranslations("brand");

  return (
    <NotFoundView
      brand={{ company: tBrand("company"), product: tBrand("product"), initials: tBrand("initials"), logo: tBrand("logo") }}
      heading={t("heading")}
      description={t("description")}
      homeLabel={t("homeLink")}
    />
  );
}
