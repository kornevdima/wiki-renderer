import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { SkipLink } from "@/components/layout/skip-link";
import { NonceBridge } from "@/components/nonce-bridge";
import { ThemeProvider } from "@/components/theme-control";
import { fontVariableClasses } from "@/fonts";
import { branding } from "@/lib/branding";
import { parseTheme, themeAttribute, THEME_COOKIE } from "@/lib/theme";

import "./globals.css";

/** The fallback tab title: the brand's title suffix ("Wiki Renderer" by default, `src/lib/branding.ts`). */
export function generateMetadata(): Metadata {
  return { title: branding().titleSuffix };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The nonce CSP (US-010, src/proxy.ts) is per request, so every HTML route
  // must render dynamically: a prerendered page's inline bootstrap scripts
  // carry no nonce and the CSP blocks them. This covers every page and Next's
  // built-in `_not-found`, which keeps this root layout unless
  // `experimental.globalNotFound` is on (Next 16.3.5 next-app-loader).
  // A future `global-error.tsx` replaces the root layout, so it won't inherit
  // this and needs its own handling. `connection()` over
  // `dynamic = "force-dynamic"`: the latter is the previous caching model.
  await connection();
  const locale = await getLocale();
  const messages = await getMessages();
  const tSkip = await getTranslations("skipLink");
  // This request's CSP nonce (`src/lib/security-headers.ts`), forwarded on
  // the request headers by `src/proxy.ts`'s `withSecurityHeaders` — handed
  // to `<NonceBridge>` so `get-nonce`'s `setNonce` runs before any Radix
  // component can mount (see that component's own doc comment for why this
  // needs no CSP widening, US-121+US-123 contract A2 revisited).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // The stored Light / Dark / System choice (US-172): a `theme` cookie, read here so the first byte of HTML already
  // carries `data-theme` and no script is needed. Anything unreadable is System, which renders no attribute.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang={locale} className={fontVariableClasses} data-theme={themeAttribute(theme)}>
      <body>
        {/* The first element in the document, so "Skip to content" is the first Tab stop on every screen (US-176). */}
        <SkipLink label={tSkip("label")} />
        <NonceBridge nonce={nonce} />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider choice={theme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
