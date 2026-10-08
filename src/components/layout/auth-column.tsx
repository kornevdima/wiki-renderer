import type { ReactNode } from "react";

import { Brand, type BrandProps } from "@/components/layout/brand";
import { MAIN_REGION } from "@/components/layout/main-region";

/**
 * The sign-in and join page's frame (US-177, app mockup: `.pg-auth`): the page's one `<main>`, a centred 440px column
 * holding the brand lockup and then the page's panel or alert. No topbar and no app shell. A 16px gutter keeps the column
 * (and a focus ring) off the window edge at 320px, and the column is `minmax(0,1fr)` so nothing inside widens it.
 */
export interface AuthColumnProps {
  brand: BrandProps;
  testId: string;
  /** Where the brand lockup links; `/signin` by default, `/` on the signed-in bare states and the 404 (US-178). */
  brandHref?: string;
  children: ReactNode;
}

export function AuthColumn({ brand, testId, brandHref = "/signin", children }: AuthColumnProps) {
  return (
    <main {...MAIN_REGION} data-testid={testId}
      className="grid min-h-dvh min-w-0 grid-cols-[minmax(0,1fr)] content-center justify-items-center gap-6 px-4 py-10"
    >
      <div className="grid w-full min-w-0 max-w-[440px] grid-cols-[minmax(0,1fr)] gap-6">
        <Brand {...brand} alwaysShowText href={brandHref} />
        {children}
      </div>
    </main>
  );
}
