import { SearchIcon } from "lucide-react";
import Link from "next/link";

import { AuthColumn } from "@/components/layout/auth-column";
import type { BrandProps } from "@/components/layout/brand";
import { Panel } from "@/components/layout/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The 404 body (US-178, app mockup: Member opens /admin: 404): the `pg-auth` column of US-177 (brand lockup, no topbar) holding
 * one flush Panel with a full EmptyState (the search icon, the `<h1>`, the text) and an outline "Back to wiki-renderer" link to
 * `/`. `app/not-found.tsx` renders it for every `notFound()` and every unmatched path, so a member's `/admin` and an unknown
 * path are the same markup. A plain, synchronous, prop-driven component; the status code stays the route's.
 */
export interface NotFoundViewProps {
  brand: BrandProps;
  heading: string;
  description: string;
  homeLabel: string;
}

export function NotFoundView({ brand, heading, description, homeLabel }: NotFoundViewProps) {
  return (
    <AuthColumn brand={brand} brandHref="/" testId="not-found">
      <Panel flush aria-label={heading}>
        <EmptyState
          icon={<SearchIcon />}
          title={heading}
          titleAs="h1"
          text={description}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/">{homeLabel}</Link>
            </Button>
          }
        />
      </Panel>
    </AuthColumn>
  );
}
