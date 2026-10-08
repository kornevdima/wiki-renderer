import type { BrandProps } from "@/components/layout/brand";
import { TENANT_LOGO_TONES, TenantLogo, type TenantLogoTone } from "@/components/ui/tenant-logo";

/**
 * The brand lockup's props for every screen, from the `brand.*` messages that `src/i18n/request.ts` fills from the
 * environment (`src/lib/branding.ts`). The mark is always a TenantLogo (design system v31): the configured logo image, or
 * the initials on the configured tone. The registry `Brand`'s ESG PNG is never shown.
 */
export interface BrandStrings {
  company: string;
  product: string;
  initials: string;
  /** A logo URL, or "" for the initials. */
  logo: string;
  tone: string;
}

function toneOf(value: string): TenantLogoTone {
  return (TENANT_LOGO_TONES as readonly string[]).includes(value) ? (value as TenantLogoTone) : "indigo";
}

export function brandProps({ company, product, initials, logo, tone }: BrandStrings): BrandProps {
  return {
    company,
    product,
    mark: (
      <TenantLogo
        name={company}
        initials={initials || undefined}
        src={logo || undefined}
        tone={toneOf(tone)}
        size="s"
        decorative
      />
    ),
  };
}
