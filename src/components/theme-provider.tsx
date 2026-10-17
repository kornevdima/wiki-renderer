"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { applyTheme, parseTheme, type ThemeChoice } from "@/lib/theme";

/**
 * The Light / Dark / System choice (US-172, shown in the settings menu, US-286, FR-048, ADR-019 amendment 2026-10-03). The root layout reads the `theme`
 * cookie on the server, renders `<html data-theme>`, and hands the same choice to `ThemeProvider`, so the control
 * starts on the stored value with no client read. A pick calls `applyTheme` (attribute at once, then the cookie).
 */
export interface ThemeState {
  choice: ThemeChoice;
  set: (next: string) => void;
}

const ThemeContext = createContext<ThemeState>({ choice: "system", set: () => undefined });

/**
 * Owns the choice for the whole document. The root layout does not re-render on a soft navigation, so the state lives
 * here, above the pages, and a control mounted later (after a `next/link` move) reads the current choice, not the one
 * the layout rendered on the first load.
 */
export function ThemeProvider({ choice: initial, children }: { choice: ThemeChoice; children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const set = useCallback((next: string) => {
    const value = parseTheme(next);
    setChoice(value);
    applyTheme(document, value);
  }, []);
  const state = useMemo(() => ({ choice, set }), [choice, set]);
  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>;
}

/** The shared choice and its setter, read through the provider so no control keeps a copy of its own. */
export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
