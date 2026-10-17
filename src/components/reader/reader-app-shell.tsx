"use client";

import type { ComponentProps } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useSidebarState } from "@/components/sidebar-state";

/** The installed `AppShell` driven by the stored sidebar state (US-281): `sidebarCollapsed` narrows the column to the strip from `bp-lg`. */
export function ReaderAppShell(props: Omit<ComponentProps<typeof AppShell>, "sidebarCollapsed">) {
  const { collapsed } = useSidebarState();
  return <AppShell {...props} sidebarCollapsed={collapsed} />;
}
