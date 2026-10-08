/**
 * "Try again" on the error page (US-205). `reset()` alone re-renders only the client boundary, so a server component that
 * threw is never refetched (measured: 0 requests). The documented recovery is `router.refresh()` and `reset()` together
 * inside one transition. Pure: the three collaborators are arguments so vitest can hand in fakes.
 */
export function retrySegment(deps: { refresh: () => void; reset: () => void; startTransition: (fn: () => void) => void }): void {
  deps.startTransition(() => {
    deps.refresh();
    deps.reset();
  });
}
