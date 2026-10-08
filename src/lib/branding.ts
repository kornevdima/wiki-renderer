import "server-only";

import { tenantInitials } from "@/components/ui/tenant-logo";
import { env } from "@/lib/env";

/**
 * The app's branding, from the environment. By default the app is "Wiki Renderer" with a "WR" TenantLogo on the
 * design system's indigo ground (v31). A deployment such as a company vault sets its own name, product line, initials or logo.
 * The values are merged into the `brand.*`, `readerShell.brandProduct` and `documentTitle.suffix` messages by
 * `src/i18n/request.ts`, so every screen that shows the brand picks them up without its own wiring.
 */
export interface Branding {
  name: string;
  product: string;
  initials: string;
  tone: "indigo" | "deep" | "glow";
  /** The logo route when `BRAND_LOGO` names a file, else "" (the initials are drawn). */
  logo: string;
  titleSuffix: string;
}

export const BRAND_LOGO_ROUTE = "/api/brand/logo";

export function branding(): Branding {
  const name = env.BRAND_NAME;
  return {
    name,
    product: env.BRAND_PRODUCT,
    initials: tenantInitials(name, env.BRAND_INITIALS),
    tone: env.BRAND_TONE,
    logo: env.BRAND_LOGO === undefined ? "" : BRAND_LOGO_ROUTE,
    titleSuffix: env.BRAND_TITLE ?? name,
  };
}
