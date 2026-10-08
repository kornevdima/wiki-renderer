import { NextResponse, type NextRequest } from "next/server";

import { routeOwnsResponseHeaders } from "@/lib/route-owned-headers";
import { withSecurityHeaders } from "@/lib/security-headers";

/**
 * Baseline security headers with a per-request CSP nonce. There is no sign-in: the app serves local folders to
 * whoever can reach the port, so bind it to localhost (the default for `next dev` / `npm start` behind `HOSTNAME`).
 * The asset and search-index routes own their response headers (an SVG carries its own sandbox CSP), so they pass
 * through untouched.
 */
export function proxy(request: NextRequest) {
  return routeOwnsResponseHeaders(request.nextUrl.pathname) ? NextResponse.next() : withSecurityHeaders(request);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
