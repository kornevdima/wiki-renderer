import { MAIN_REGION_ID, SKIP_LINK_ID } from "./main-region";

/**
 * "Skip to content" (US-176, NFR-009 via CR-006): the root layout's first element, so it is the first Tab stop on every
 * screen. Parked above the page until focused, then a solid primary chip at the top left; activating it moves focus to the
 * `#main` region (`MAIN_REGION`). The label is resolved by the layout, so this renders without a request context.
 */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      id={SKIP_LINK_ID}
      href={`#${MAIN_REGION_ID}`}
      data-testid="skip-link"
      className="absolute top-4 left-4 z-(--z-toast) -translate-y-[200%] rounded-(--ds-radius-md) bg-primary px-4 py-2 font-bold text-primary-foreground no-underline focus:translate-y-0 print:hidden"
    >
      {label}
    </a>
  );
}
