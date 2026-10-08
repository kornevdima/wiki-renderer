"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect } from "react";

import { ErrorPage } from "@/components/error-page";
import { fontVariableClasses } from "@/fonts";
import { parseTheme, THEME_COOKIE, themeAttribute } from "@/lib/theme";

import { brand, errorPage, readerShell, retryView, unavailableView } from "../../messages/en.json";

import "./globals.css";

/**
 * The root layout's error boundary (US-205): it replaces the root layout, so it brings its own `<html>` and `<body>`, the same
 * global stylesheet, the brand font variables and the same page as `error.tsx`. The root layout's providers are gone, so the
 * messages the page reads (these five namespaces of `en.json`, the one source) are handed to its own `NextIntlClientProvider`.
 * Measured at US-205 fix round 2: the bundler does not tree-shake a JSON module, so this chunk carries the whole catalogue
 * whichever way it is imported (about 30 kB, 9 kB gzipped, loaded only when the root layout fails).
 *
 * Theme: a client component cannot read request cookies on the server, and the nonce-only CSP rules out an inline pre-paint
 * script, so the stored `theme` cookie (US-172) is applied from `document.cookie` right after hydration. `system` and a
 * missing cookie set no attribute, so the OS preference applies from the first paint; a stored Light or Dark choice can show
 * the system theme for a frame first. The error is not rendered (see `ErrorPage`).
 */
const GLOBAL_MESSAGES = { brand, readerShell, errorPage, retryView, unavailableView };

function storedTheme(): string | undefined {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${THEME_COOKIE}=`));
  return themeAttribute(parseTheme(entry?.slice(THEME_COOKIE.length + 1)));
}

export default function GlobalError() {
  useEffect(() => {
    const attribute = storedTheme();
    if (attribute) document.documentElement.dataset.theme = attribute;
  }, []);

  return (
    <html lang="en" className={fontVariableClasses}>
      <body>
        <NextIntlClientProvider locale="en" timeZone="UTC" messages={GLOBAL_MESSAGES}>
          <ErrorPage onRetry={() => window.location.reload()} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
