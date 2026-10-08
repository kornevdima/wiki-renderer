"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";

import { INITIAL_NAV_STATE, navReducer, restoresFocus, type NavAction } from "./app-shell-state";
import { inertOutsideIds } from "./app-shell-state";
import { PAGE_CONTENT_CLASS, SHELL_MAIN_CLASS, SKIP_LINK_ID } from "./main-region";

/**
 * The admin app shell (US-176, NFR-013): a sidebar slot, a topbar slot and the content column with the page gutter. At `bp-lg`
 * (1024px) and above the sidebar is static in the first column. Below it the sidebar is a drawer at `z-drawer`: the menu button
 * in the topbar opens it over the page, `scrim` covers the page, the topbar and content go `inert`, Escape or a tap on the scrim
 * closes it, and focus goes to the first link on open and back to the menu button on close. The slide is the mockup's, and
 * it is off under prefers-reduced-motion. The page's own `<main>` (with `MAIN_REGION`) is the `children`.
 */
interface NavContext {
  open: boolean;
  toggle: () => void;
  /** A callback ref for the menu button, so the shell can give it focus back (a ref object in the context would trip the refs-during-render rule). */
  setButton: (element: HTMLButtonElement | null) => void;
}

const ShellContext = createContext<NavContext | null>(null);

/** The shell's drawer state, for the topbar's menu button. Null outside an `AppShell` (the home has no drawer). */
export function useAppShell(): NavContext | null {
  return useContext(ShellContext);
}

/** The id the menu button's `aria-controls` names. */
export const APP_NAV_ID = "app-nav";

const WIDE = "(min-width: 1024px)";

const SIDEBAR_CLASS =
  "min-w-0 border-e border-border bg-background lg:sticky lg:top-0 lg:col-start-1 lg:row-start-1 lg:h-screen lg:self-start lg:overflow-y-auto " +
  "max-lg:invisible max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-(--z-drawer) max-lg:w-(--sidebar-w) max-lg:-translate-x-full max-lg:overflow-y-auto max-lg:shadow-(--shadow-raised) " +
  // The slide exists only under `motion-safe`: with reduced motion no transition rule is generated at all, so none can win the cascade.
  "motion-safe:max-lg:transition-[translate,visibility] motion-safe:max-lg:duration-(--duration-base) motion-safe:max-lg:ease-standard motion-safe:max-lg:[transition-delay:0s,var(--duration-base)] " +
  "max-lg:data-[open=true]:visible max-lg:data-[open=true]:translate-x-0 motion-safe:max-lg:data-[open=true]:[transition-property:translate] motion-safe:max-lg:data-[open=true]:[transition-delay:0s]";

export interface AppShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  testId?: string;
  /** Extra `data-*` attributes for the wrapper (the reader puts `data-wiki-id` on `reader-shell`); the admin console passes none. */
  dataAttributes?: Record<`data-${string}`, string>;
  /** The Sidebar is collapsed to icons: from bp-lg the sidebar column narrows to `sidebar-w-collapsed`. Below bp-lg the sidebar is the drawer and always full width. */
  sidebarCollapsed?: boolean;
}

export function AppShell({ sidebar, topbar, children, testId, dataAttributes, sidebarCollapsed = false }: AppShellProps) {
  const [nav, dispatchNav] = useReducer(navReducer, INITIAL_NAV_STATE);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef(false);
  const wasOpen = useRef(false);

  const dispatch = useCallback((action: NavAction) => {
    restoreFocus.current = restoresFocus(action);
    dispatchNav(action);
  }, []);
  const toggle = useCallback(() => dispatch({ type: "toggle" }), [dispatch]);
  const setButton = useCallback((element: HTMLButtonElement | null) => {
    buttonRef.current = element;
  }, []);

  // A viewport that grows to `bp-lg` closes the drawer, so the page behind is never left inert with no drawer on screen.
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = (event: MediaQueryListEvent) => dispatch({ type: "viewport", wide: event.matches });
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [dispatch]);

  // Escape closes it wherever focus is (the topbar and content are inert, so it is in the drawer).
  useEffect(() => {
    if (!nav.open) return;
    const onKeyDown = (event: KeyboardEvent) => dispatch({ type: "key", key: event.key });
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [nav.open, dispatch]);

  // The skip link sits in the root layout, outside the shell, so it goes inert here while the drawer is open (Tab stays in the drawer).
  useEffect(() => {
    const elements = inertOutsideIds(nav.open, [SKIP_LINK_ID]).map((id) => document.getElementById(id));
    for (const element of elements) element?.setAttribute("inert", "");
    return () => {
      for (const element of elements) element?.removeAttribute("inert");
    };
  }, [nav.open]);

  // Focus follows the drawer: in on open, back to the menu button on a viewer's own close.
  useEffect(() => {
    if (nav.open && !wasOpen.current) {
      sidebarRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    } else if (!nav.open && wasOpen.current && restoreFocus.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = nav.open;
  }, [nav.open]);

  return (
    <ShellContext.Provider value={{ open: nav.open, toggle, setButton }}>
      <div
        {...dataAttributes}
        data-testid={testId}
        data-open={nav.open}
        data-sidebar-collapsed={sidebarCollapsed || undefined}
        className={`grid min-h-screen grid-cols-[minmax(0,1fr)] bg-background text-foreground ${sidebarCollapsed ? "lg:grid-cols-[var(--sidebar-w-collapsed)_minmax(0,1fr)]" : "lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]"}`}
      >
        <div
          id={APP_NAV_ID}
          ref={sidebarRef}
          data-testid="app-shell-sidebar"
          data-open={nav.open}
          className={SIDEBAR_CLASS}
          onClick={(event) => {
            // A link in the drawer navigates, so the drawer closes; focus is not pulled back to a button on a page that is leaving.
            if (event.target instanceof Element && event.target.closest("a[href]")) dispatch({ type: "navigated" });
          }}
        >
          {sidebar}
        </div>
        <div
          aria-hidden="true"
          data-testid="app-shell-scrim"
          data-open={nav.open}
          className="fixed inset-0 z-[calc(var(--z-drawer)-1)] hidden bg-scrim max-lg:data-[open=true]:block"
          onClick={() => dispatch({ type: "close" })}
        />
        {/* One column for the topbar and the page, so the topbar's sticky has the whole page to stick in; it grows when its actions wrap. */}
        <div inert={nav.open} className="col-start-1 row-start-1 flex min-w-0 flex-col lg:col-start-2">
          <div className="sticky top-0 z-(--z-sticky) min-w-0">{topbar}</div>
          <div className="min-w-0 flex-1">
            <div className={`${PAGE_CONTENT_CLASS} ${SHELL_MAIN_CLASS}`}>{children}</div>
          </div>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
