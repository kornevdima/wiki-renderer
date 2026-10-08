import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { toBreadcrumbItems, type Crumb } from "./breadcrumbs-view-model";

/**
 * The breadcrumb trail (US-176): a labelled `<nav>` with an ordered list, a chevron between crumbs, links on every crumb but
 * the last, and `aria-current="page"` on the last. The nav label ("Breadcrumb") is resolved by the caller. A long crumb is
 * cut with an ellipsis rather than pushing the page sideways, and the current crumb carries its full text as `title` (US-188). `next/link`, as every internal link here.
 */
export interface BreadcrumbsProps {
  label: string;
  crumbs: readonly Crumb[];
}

export function Breadcrumbs({ label, crumbs }: BreadcrumbsProps) {
  const items = toBreadcrumbItems(crumbs);
  return (
    <nav aria-label={label} data-testid="breadcrumbs" className="min-w-0">
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0 text-sm">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap text-muted-foreground last:flex-initial">
            {index > 0 ? <ChevronRightIcon aria-hidden="true" className="size-(--icon-ui) flex-none text-ink-muted" /> : null}
            {item.current ? (
              <span aria-current="page" title={item.label} className="block min-w-0 truncate font-bold text-foreground">
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="block max-w-60 truncate rounded-(--ds-radius-sm) text-muted-foreground underline-offset-2 transition-[color] duration-(--duration-base) ease-(--ease-base) hover:text-foreground hover:underline motion-reduce:transition-none"
              >
                {item.label}
              </Link>
            ) : (
              <span className="block min-w-0 truncate">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
