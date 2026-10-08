/**
 * The one refusal and the sha shape check shared by the access-checked API routes that serve a wiki's bytes under a
 * SHA-qualified URL (the asset route, US-105; the search-index route, US-090). Both routes answer every refusal with
 * this exact response (SR-020, TC-459, TC-472), so the headers live here once and cannot drift apart.
 */

/** The one refusal's headers, verbatim. */
export const REFUSAL_HEADERS: Readonly<Record<string, string>> = Object.freeze({ "Cache-Control": "private, no-store" });

/** 404, an empty body, `REFUSAL_HEADERS`. Nothing in it names a reason. */
export function refusal(): Response {
  return new Response(null, { status: 404, headers: { ...REFUSAL_HEADERS } });
}

/** A sha segment shape check only (length and characters); equality with the snapshot's sha is the real gate. */
export function plausibleSha(sha: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(sha) && sha !== "." && sha !== "..";
}

/** The CSP on every served asset and source download: sandboxed, nothing loadable. */
export const SANDBOX_CSP = "sandbox; default-src 'none'";
