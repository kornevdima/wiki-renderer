"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { serializeSidebarCookie } from "@/lib/sidebar";

/**
 * The reader's sidebar state (US-281). `SidebarStateProvider` (root layout) owns the choice the server read from the `wr-sidebar`
 * cookie; `setCollapsed` shows it at once and stores it. The collapse button and the A4 auto-collapse both go through it.
 */
interface SidebarStateValue {
  collapsed: boolean;
  /** Shows and stores the state. */
  setCollapsed: (next: boolean) => void;
  /** Shows the state for now (a drag in progress); stores nothing. */
  previewCollapsed: (next: boolean) => void;
}

const SidebarStateContext = createContext<SidebarStateValue>({ collapsed: false, setCollapsed: () => undefined, previewCollapsed: () => undefined });

export function useSidebarState(): SidebarStateValue {
  return useContext(SidebarStateContext);
}

export function SidebarStateProvider({ collapsed: initial, children }: { collapsed: boolean; children: ReactNode }) {
  const [collapsed, setState] = useState(initial);
  const previewCollapsed = useCallback((next: boolean) => setState(next), []);
  const setCollapsed = useCallback((next: boolean) => {
    setState(next);
    try {
      document.cookie = serializeSidebarCookie(next, location.protocol === "https:");
    } catch {
      // The choice holds for this view only.
    }
  }, []);
  const value = useMemo(() => ({ collapsed, setCollapsed, previewCollapsed }), [collapsed, setCollapsed, previewCollapsed]);
  return <SidebarStateContext.Provider value={value}>{children}</SidebarStateContext.Provider>;
}
