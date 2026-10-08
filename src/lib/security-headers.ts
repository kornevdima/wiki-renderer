import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based CSP + response-header wiring (SR-015, ADR-016 T2, US-010 contract).
 *
 * `buildCsp` is a pure string builder, kept separate from the Next-specific
 * request/response wiring so it can be reasoned about (and later reused) on
 * its own. `withSecurityHeaders` is that wiring: it generates a per-request
 * nonce, forwards it — and the CSP itself — on the *request* headers so
 * Next's own RSC/script bootstrap can find and apply it (the documented
 * mechanism: Next parses the incoming `Content-Security-Policy` request
 * header for a `'nonce-…'` token), and sets the same CSP on the *response*.
 *
 * US-014 wraps `src/proxy.ts` with Auth.js's `auth((req) => …)`; that wrapper
 * composes this helper the same way: call `withSecurityHeaders(req)` and
 * return what it returns (or fold its header-setting shape onto whatever
 * response Auth.js itself produces), so the CSP survives the auth gate.
 *
 * US-014 (contract R7) adds exactly `form-action 'self' https://accounts.google.com`
 * — the server `signIn("google")` action's form posts there. US-014 added no third-party `img-src` (it rendered no
 * `<img>`). **S06 wave 7 (R-2) widens `img-src` to `'self' data: blob: https:`** so standard external Markdown images
 * load in the viewer's browser; it is the one `img-src` change, `http:` is still absent, and the Google avatar is still
 * not rendered.
 *
 * **S06 wave 2 (2026-09-30) adds exactly two directives, `style-src-attr 'unsafe-inline'` (R-1, Shiki) and
 * `style-src-elem 'self' 'unsafe-inline'` (R-8, Mermaid's `<style>`), both operator-ruled; see the comments in
 * `buildCsp`. `style-src` keeps its nonce, `script-src` and every other directive are unchanged, and the A2 note
 * below (Radix's `<style>` is covered by the nonce bridge, not by a policy widening) is still how Radix is handled:
 * `nonce-bridge.tsx` stays.**
 *
 * (Consequence, noted in review r1 F5: with `style-src-attr` and `style-src-elem` both set, `style-src`'s nonce is only
 * the fallback directive and the nonce bridge is belt-and-braces.)
 *
 * **A2 revisited (2026-09-22, US-121+US-123 contract) — no CSP change after
 * all.** A2's original ruling (`style-src-attr 'unsafe-inline'`) turned out,
 * on measurement, not to govern the actual violation (Radix's Dialog
 * injects a `<style>` *element* via `react-style-singleton`, not a `style=`
 * attribute — `effectiveDirective` was `style-src-elem`). A follow-up
 * attempt to widen `style-src-elem` instead was rejected by the operator as
 * broader than what was agreed (an `'unsafe-inline'` grant, even scoped to
 * one sub-directive, is still a real CSP relaxation). The actual fix needs
 * **no CSP change at all**: `react-style-singleton` reads its nonce from
 * `get-nonce`'s `getNonce()` at the moment it injects its `<style>` tag,
 * and sets it as that tag's own `nonce` attribute if present. The per-request
 * nonce this module already generates is handed to `get-nonce`'s `setNonce`
 * on the client (`src/components/nonce-bridge.tsx`, rendered once in
 * `src/app/layout.tsx`) before any Radix component can mount, so the
 * injected `<style>` tag now carries the *same* nonce the CSP header
 * already allows — `style-src`'s existing nonce covers it, unchanged. This
 * policy is otherwise exactly as it was before A2 was ever proposed.
 *
 * Deliberately still left out of this policy (US-010 contract, so later
 * stories don't trip over an unexplained gap):
 * - `upgrade-insecure-requests` — breaks `http://localhost` in dev.
 *
 * `'unsafe-eval'` is never added pre-emptively (ADR-016 T2: never
 * unconditionally, production never gets it). If a dev-only exception turns
 * out to be measurably necessary, it belongs here, gated on
 * `process.env.NODE_ENV !== "production"`, and reported explicitly — not
 * assumed in advance.
 */

/** A fresh, unpredictable nonce for one request (16+ random bytes via `crypto.randomUUID()`, base64-encoded). */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * The production CSP directive string for one request's nonce. No `'unsafe-eval'`, and `'unsafe-inline'` only on
 * `style-src-attr` and `style-src-elem` (R-1, R-8); never on `script-src` or `style-src`.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    // S06 wave 2 (operator R-1, R-8; ADR-016 amendments 2026-09-30). Two narrow, sub-directive-scoped relaxations, and
    // nothing else changes: `style-src` above keeps its nonce and gains no `'unsafe-inline'`.
    // R-1: Shiki's server-rendered `style="--shiki-*"` attributes. The sanitiser (exact lists) and
    //      `rehypeStripAuthorAttrs` decide which inline styles can exist.
    "style-src-attr 'unsafe-inline'",
    // R-8: Mermaid's own `<style>` element (core creates it with no nonce hook, and DOMPurify parses it inside a
    //      DOMParser document). NO nonce here on purpose: a nonce (or hash) in a directive makes browsers ignore
    //      `'unsafe-inline'` in that same directive.
    "style-src-elem 'self' 'unsafe-inline'",
    // S06 wave 7 (operator R-2; ADR-016 amendment 2026-09-30): standard `![alt](https://...)` images load in the viewer's
    //      own browser (SR-008: direct, never proxied, never fetched by the server). `http:` stays blocked. Relative
    //      images are same-origin (`'self'`), through the asset route.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    // US-014 (contract R7): the server `signIn("google")` action's form
    // posts here. Nothing broader — see the module comment.
    "form-action 'self' https://accounts.google.com",
  ].join("; ");
}

/**
 * Applies the nonce CSP to a proxy/middleware response: forwards `x-nonce`
 * and the CSP on the request Next renders with, and sets the CSP on the
 * response returned to the client.
 */
export function withSecurityHeaders(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
