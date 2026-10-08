import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Static response headers. The CSP carries a per-request nonce and is set in `src/proxy.ts`; these are the headers
  // that don't need one, and they also reach `_next/static`, which the proxy matcher excludes.
  async headers() {
    return [
      // The retry screen is a 200, so nothing under `/w/*` is indexed.
      {
        source: "/w/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      // The asset route (US-105) is skipped by the proxy's nonce CSP (`isAssetPath`), so the page CSP's `frame-ancestors
      // 'self'` does not reach it; this is its equivalent, on every response of the route (served and refused alike).
      {
        source: "/api/wikis/:wikiId/asset/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// next-intl without i18n routing. The plugin wires the per-request
// config at src/i18n/request.ts (English only; see that file).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
