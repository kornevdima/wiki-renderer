import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The home topbar's brand (US-176, app mockup: Home topbar): the ESG logo mark and the "The Firm" / "wiki-renderer" text,
 * linking to `/`. The mark is the mockup's own PNG, served from `public/`. Below `bp-md` the text is visually hidden, not removed,
 * so the link keeps its name. Both strings are resolved by the caller (`brand.*`).
 *
 * `mark` replaces the ESG mark for a tenant or an unbranded app: pass a decorative TenantLogo at size `s` (ruled
 * 2026-10-08, never a variant of the ESG mark).
 */
export interface BrandProps {
  company: string;
  product: string;
  /** The text stays visible at every width (the sign-in and join column); by default it is visually hidden below `bp-md`. */
  alwaysShowText?: boolean;
  /** Where the lockup links; `/` by default, `/signin` on the sign-in and join column (US-177). */
  href?: string;
  /** The mark in place of the ESG logo, e.g. `<TenantLogo name={company} size="s" decorative />`. */
  mark?: ReactNode;
}

export function Brand({ company, product, alwaysShowText = false, href = "/", mark }: BrandProps) {
  return (
    <Link href={href} data-testid="brand" className="inline-flex items-center gap-3 text-foreground no-underline">
      {mark ?? <Image src="/esg-logo-mark.png" alt="" width={36} height={36} unoptimized className="size-(--logo-mark-sm)" />}
      <span className={alwaysShowText ? "grid" : "grid max-md:sr-only"}>
        <span className="font-bold">{company}</span>
        <span className="text-[13px] text-muted-foreground">{product}</span>
      </span>
    </Link>
  );
}
