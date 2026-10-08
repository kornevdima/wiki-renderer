import type { ReactNode } from "react";

import { Brand, type BrandProps } from "@/components/layout/brand";
import { MAIN_REGION } from "@/components/layout/main-region";

/**
 * The bare frame (US-195, reader mockup `.wr-bare`): the page of a reader screen that has no snapshot and so no shell. A slim bar
 * (`--topbar-h` tall, a hairline bottom border, the brand lockup only, no "All wikis" link) over the page's one `<main>`, which
 * centres its content on the page ground. It is NOT the sign-in column (`AuthColumn`, US-177). The bar is a plain `header` (the
 * page's banner landmark) and does not print. The `<main>` carries the caller's test id and, optionally, a `data-kind`. Nothing here takes a wiki name, id or path (US-100).
 */
export interface BareFrameProps {
  brand: BrandProps;
  testId: string;
  kind?: string;
  children: ReactNode;
}

export function BareFrame({ brand, testId, kind, children }: BareFrameProps) {
  return (
    <div data-slot="bare-frame" className="grid min-h-dvh min-w-0 grid-rows-[auto_1fr] bg-background text-foreground">
      <header
        data-slot="bare-frame-bar"
        className="flex h-(--topbar-h) min-w-0 items-center gap-3 border-b border-border px-4 print:hidden lg:px-8"
      >
        <Brand {...brand} alwaysShowText />
      </header>
      <main {...MAIN_REGION} data-testid={testId} data-kind={kind} className="grid min-w-0 grid-cols-[minmax(0,1fr)] place-items-center px-4 py-6">
        {children}
      </main>
    </div>
  );
}
