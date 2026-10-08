import Link from "next/link";

/**
 * The brand lockup: a mark and the name / product text, linking to `/`. The mark is the configured logo when there is
 * one (`brand.logo`, served by `/api/brand/logo`), otherwise an avatar: the initials (`brand.initials`, "WR" by default)
 * on the design system's brand gradient, the same fill as the `brand` button. Below `bp-md` the text is visually
 * hidden, not removed, so the link keeps its name. Every value is resolved by the caller from the `brand.*` messages,
 * which `src/i18n/request.ts` fills from the environment (`src/lib/branding.ts`).
 *
 * App-owned: this file replaced the registry's `@esg` lockup (which hard-codes the ESG logo mark) on 2026-10-08.
 */
export interface BrandProps {
  company: string;
  product: string;
  /** The avatar's initials; the first letters of the first two words of `company` when absent. */
  initials?: string;
  /** A logo image URL; when non-empty it replaces the initials avatar. */
  logo?: string;
  /** The text stays visible at every width; by default it is visually hidden below `bp-md`. */
  alwaysShowText?: boolean;
  /** Where the lockup links; `/` by default. */
  href?: string;
}

/** Up to two initials: the first letter of the first two words ("Wiki Renderer" -> "WR", "Acme" -> "A"). */
export function initialsOf(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join("");
}

export function Brand({ company, product, initials, logo = "", alwaysShowText = false, href = "/" }: BrandProps) {
  return (
    <Link href={href} data-testid="brand" className="inline-flex items-center gap-3 text-foreground no-underline">
      {logo === "" ? (
        <span
          data-testid="brand-avatar"
          aria-hidden="true"
          className="grid size-(--logo-mark-sm) flex-none place-items-center rounded-(--ds-radius-round) bg-primary bg-(image:--gradient-brand) text-sm font-bold tracking-wide text-primary-foreground select-none"
        >
          {initials || initialsOf(company)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a local file of unknown size; next/image adds nothing here
        <img src={logo} alt="" width={36} height={36} data-testid="brand-logo" className="size-(--logo-mark-sm) flex-none object-contain" />
      )}
      <span className={alwaysShowText ? "grid" : "grid max-md:sr-only"}>
        <span className="font-bold">{company}</span>
        <span className="text-[13px] text-muted-foreground">{product}</span>
      </span>
    </Link>
  );
}
