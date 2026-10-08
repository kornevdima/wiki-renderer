import { getRequestConfig } from "next-intl/server";

import { branding } from "@/lib/branding";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * next-intl request config: English only, no locale detection. The branding from the environment
 * (`src/lib/branding.ts`) overrides the brand strings in the messages, so no screen wires it separately.
 */
export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  const base = (await import(`../../messages/${locale}.json`)).default;
  const brand = branding();
  const messages = {
    ...base,
    brand: { ...base.brand, company: brand.name, product: brand.product, initials: brand.initials, logo: brand.logo },
    readerShell: { ...base.readerShell, brandProduct: brand.product },
    documentTitle: { ...base.documentTitle, suffix: brand.titleSuffix },
  };

  return { locale, messages };
});
