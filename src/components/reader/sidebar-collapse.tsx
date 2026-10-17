"use client";

import type { ReactNode } from "react";

import { Sidebar, SidebarCollapseButton } from "@/components/layout/sidebar";
import { useSidebarState } from "@/components/sidebar-state";

/** The DS collapse button wired to the stored sidebar state (US-281). Must sit inside the DS `Sidebar`. */
export function ReaderSidebarCollapse({ collapseLabel, expandLabel }: { collapseLabel: string; expandLabel: string }) {
  const { collapsed, setCollapsed } = useSidebarState();
  return <SidebarCollapseButton collapseLabel={collapseLabel} expandLabel={expandLabel} onToggle={() => setCollapsed(!collapsed)} />;
}

/**
 * The DS `Sidebar` around the reader's own content (US-281, "Pull DS sidebar, wrap ours"), collapsed to the strip by the stored state.
 * The brand mark and the expand button stay in the strip; the body is hidden by `wr-reader.css`. Hidden in print.
 */
export function ReaderSidebarFrame({ label, children }: { label: string; children: ReactNode }) {
  const { collapsed } = useSidebarState();
  return (
    <Sidebar label={label} collapsed={collapsed} className="print:hidden">
      {children}
    </Sidebar>
  );
}
