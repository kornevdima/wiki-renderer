export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbItem {
  label: string;
  /** Null on the current page, and on any crumb given no href. */
  href: string | null;
  current: boolean;
}

export function toBreadcrumbItems(crumbs: readonly Crumb[]): BreadcrumbItem[] {
  return crumbs.map((crumb, index) => {
    const current = index === crumbs.length - 1;
    return { label: crumb.label, href: current ? null : (crumb.href ?? null), current };
  });
}
