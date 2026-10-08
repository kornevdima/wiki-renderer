import { Children, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The Panel (US-176, NFR-013): a flat surface with the hairline and the large radius (cards stay flat, no shadow). An
 * optional head (title, meta line, actions), a body, and an optional foot over a divider. `muted` takes the muted surface;
 * `flush` drops the padding so a table can run edge to edge under the head. It is a `<section>` named by its title through
 * `titleId`, so a caller that already gives its heading an id keeps it (`aria-labelledby` points at it).
 */
export interface PanelProps extends Omit<ComponentProps<"section">, "title"> {
  title?: ReactNode;
  titleId?: string;
  /** The heading level of the title; the page's own `<h1>` is the PageHeader's. */
  titleLevel?: 2 | 3;
  meta?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  muted?: boolean;
  flush?: boolean;
}

export function Panel({ title, titleId, titleLevel = 2, meta, actions, footer, muted, flush, className, children, ...props }: PanelProps) {
  const Heading = titleLevel === 2 ? "h2" : "h3";
  const hasHead = title != null || actions != null;
  // No children, no body element: an empty one still adds a grid row and a 16px gap (US-212 R2).
  const hasBody = Children.toArray(children).length > 0;
  return (
    <section
      data-slot="panel"
      aria-labelledby={title != null ? titleId : undefined}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] content-start rounded-(--ds-radius-lg) border border-border text-foreground",
        muted ? "bg-muted" : "bg-background",
        flush
          ? // These variants apply to any table in a flush Panel (the project-detail tables and the audit card): its own border and radius go, edge to edge, and a hairline rule above it stays (US-212 R4, R5).
            "gap-0 overflow-hidden [&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-x-0 [&_[data-slot=table-container]]:border-b-0"
          : "gap-4 p-6",
        className,
      )}
      {...props}
    >
      {hasHead ? (
        <div className={cn("flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2", flush && "px-6 pt-6 pb-4")}>
          <div className="grid min-w-0 gap-1">
            {title != null ? (
              <Heading id={titleId} className="m-0 text-xl/6 font-bold text-balance text-foreground">
                {title}
              </Heading>
            ) : null}
            {meta != null ? <p className="m-0 text-sm text-muted-foreground">{meta}</p> : null}
          </div>
          {actions != null ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {hasBody ? <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", flush ? "gap-0" : "gap-4")}>{children}</div> : null}
      {footer != null ? (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border", flush ? "px-6 py-3" : "pt-4")}>{footer}</div>
      ) : null}
    </section>
  );
}
