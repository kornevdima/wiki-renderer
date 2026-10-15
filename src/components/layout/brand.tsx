import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The home topbar's brand (US-176, app mockup: Home topbar): the ESG logo mark and the "EasySoftGroup" / "wiki-renderer" text,
 * linking to `/`. The mark is the mockup's own PNG, served from `public/` as a plain `img` with width and height, not `next/image`, which writes an inline `style` into the server HTML that a strict nonce CSP refuses (the Sidebar's brand does the same). Below `bp-md` the text is visually hidden, not removed,
 * so the link keeps its name. Both strings are resolved by the caller (`brand.*`).
 *
 * `mark` replaces the ESG mark for a tenant or an unbranded app: pass a decorative TenantLogo at size `s` (ruled
 * 2026-10-08, never a variant of the ESG mark).
 *
 * `inverse` sits on the dark brand ground (EntryLayout's brand panel, BrandLockup `--inverse`): white name, the
 * on-highlight muted product line, and a white focus ring (the violet ring is under 3:1 on indigo).
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
  /** On the dark brand ground (EntryLayout's brand panel). */
  inverse?: boolean;
}

export function Brand({ company, product, alwaysShowText = false, href = "/", mark, inverse = false }: BrandProps) {
  return (
    <Link
      href={href}
      data-testid="brand"
      data-slot="brand"
      data-inverse={inverse || undefined}
      className={
        inverse
          ? "inline-flex items-center gap-3 rounded-(--ds-radius-sm) text-ink-on-inverse no-underline focus-visible:outline-ink-on-inverse"
          : "inline-flex items-center gap-3 rounded-(--ds-radius-sm) text-foreground no-underline"
      }
    >
      {mark ?? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image writes style="color:transparent" into server HTML, which a strict nonce CSP (style-src without 'unsafe-inline') refuses; this fixed-size PNG from public/ needs no optimisation
        <img src="/esg-logo-mark.png" alt="" width={36} height={36} className="size-(--logo-mark-sm)" />
      )}
      <span className={alwaysShowText ? "grid" : "grid max-md:sr-only"}>
        <span className="font-bold">{company}</span>
        <span className={inverse ? "text-[13px] text-ink-on-highlight-muted" : "text-[13px] text-muted-foreground"}>{product}</span>
      </span>
    </Link>
  );
}
