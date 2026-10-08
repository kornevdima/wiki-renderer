import localFont from "next/font/local";

/**
 * The ESG brand fonts (US-171, ADR-019, tokens v9 `type.fonts`), self-hosted: the files are the design system's own
 * (`project/fonts/` in the design-system repo), copied here with the Lilex licence next to them. `next/font/local` emits
 * them under `/_next/static/media` on the app's own origin, so the CSP's `font-src 'self'` already covers them (SR-015).
 * `font-display: swap` is stated (not left to the default). Figtree keeps `adjustFontFallback` on (Next's default), so its
 * generated fallback face is size-adjusted and the swap shifts nothing. Lilex turns it off (dispatcher ruling 2026-10-03):
 * the generated fallback would be Arial, proportional, so code would show in Arial until the file arrives. With it off,
 * code falls straight to the system mono stack and the swap is mono to mono.
 *
 * Each font publishes a CSS variable on `<html>` (`--font-figtree`, `--font-lilex`); `globals.css` puts them first in
 * `--font-sans` / `--font-mono`, ahead of the system stacks from tokens v9 `type.families`.
 */
export const figtree = localFont({
  src: "./Figtree-latin.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
  variable: "--font-figtree",
});

export const lilex = localFont({
  src: "./Lilex-latin.woff2",
  weight: "100 700",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-lilex",
});

/** The class names that publish both variables; set on `<html>`. */
export const fontVariableClasses = `${figtree.variable} ${lilex.variable}`;
