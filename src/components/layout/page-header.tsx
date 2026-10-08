import type { ReactNode } from "react";

import { Breadcrumbs } from "./breadcrumbs";
import type { Crumb } from "./breadcrumbs-view-model";

/**
 * The page heading block (US-176, NFR-013): breadcrumbs, the title (the page's one `<h1>`), a meta line with optional icons,
 * and an actions area that sits beside the title on a wide screen and under it on a narrow one. Everything but the title is
 * optional, and nothing is invented: a caller passes only what the page already shows. `titleId` and `titleTestId` keep a
 * page's existing heading id (a table's scroll region is named through it) and test id.
 */
export interface PageHeaderMeta {
  icon?: ReactNode;
  text: ReactNode;
}

export interface PageHeaderProps {
  title: ReactNode;
  titleId?: string;
  titleTestId?: string;
  /** Makes the title a programmatic-focus target (`tabindex="-1"`, not a tab stop): where focus lands when its opener unmounts (US-181). */
  titleFocusable?: boolean;
  breadcrumbs?: { label: string; crumbs: readonly Crumb[] };
  meta?: readonly PageHeaderMeta[];
  actions?: ReactNode;
  testId?: string;
}

export function PageHeader({ title, titleId, titleTestId, titleFocusable, breadcrumbs, meta, actions, testId }: PageHeaderProps) {
  return (
    <div data-testid={testId} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-foreground">
      {breadcrumbs ? <Breadcrumbs label={breadcrumbs.label} crumbs={breadcrumbs.crumbs} /> : null}
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="grid min-w-0 gap-2">
          <h1 id={titleId} data-testid={titleTestId} tabIndex={titleFocusable ? -1 : undefined} className="m-0 min-w-0 text-[28px]/9 font-bold [overflow-wrap:anywhere]">
            {title}
          </h1>
          {meta && meta.length > 0 ? (
            <ul data-testid="page-header-meta" className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0 text-[13px] text-muted-foreground">
              {meta.map((item, index) => (
                <li key={index} className="inline-flex items-center gap-2 [&_svg]:size-(--icon-ui) [&_svg]:flex-none">
                  {item.icon}
                  {item.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {actions ? (
          <div data-testid="page-header-actions" className="flex flex-none flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
