/**
 * Unit specs for `@/lib/security-headers` (US-010 contract, ADR-016). S06 wave 2 (US-072 + US-104 contract, D9)
 * re-pins the policy: exactly two operator-ruled additions over the pre-A2 shape, `style-src-attr 'unsafe-inline'`
 * (R-1, Shiki's inline `style` attributes) and `style-src-elem 'self' 'unsafe-inline'` (R-8, Mermaid's own `<style>`),
 * and nothing else. Wave 7 (P1, R-2) adds `https:` to `img-src` and nothing else; `http:` stays absent. Any further widening shows up as a failing diff here, not silently.
 */
import { describe, expect, it } from "vitest";

import { buildCsp, createNonce } from "@/lib/security-headers";

function directive(csp: string, name: string): string | undefined {
  return csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));
}

describe("buildCsp — the exact directive set (pre-A2 shape plus R-1 and R-8)", () => {
  it("emits exactly these directives, in this order, for a given nonce", () => {
    const csp = buildCsp("TEST_NONCE");

    expect(csp).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-TEST_NONCE' 'strict-dynamic'",
        "style-src 'self' 'nonce-TEST_NONCE'",
        "style-src-attr 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "form-action 'self' https://accounts.google.com",
      ].join("; "),
    );
  });

  it("P1 R-2: img-src is exactly 'self' data: blob: https:, and http: is absent", () => {
    const d = directive(buildCsp("N"), "img-src");
    expect(d).toBe("img-src 'self' data: blob: https:");
    expect(d?.split(" ")).not.toContain("http:");
    expect(d).not.toContain("*");
  });

  it("D9 R-1: style-src-attr is exactly 'unsafe-inline'", () => {
    expect(directive(buildCsp("N"), "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
  });

  it("D9 R-8: style-src-elem is exactly 'self' 'unsafe-inline' and carries no nonce (a nonce would void 'unsafe-inline')", () => {
    const d = directive(buildCsp("N"), "style-src-elem");
    expect(d).toBe("style-src-elem 'self' 'unsafe-inline'");
    expect(d).not.toContain("nonce-");
  });

  it("style-src still carries its own nonce and no 'unsafe-inline'", () => {
    const d = directive(buildCsp("N"), "style-src");
    expect(d).toBe("style-src 'self' 'nonce-N'");
    expect(d).not.toContain("unsafe-inline");
  });

  it("script-src is byte-identical to before — nonce + strict-dynamic, never 'unsafe-inline'/'unsafe-eval'", () => {
    const csp = buildCsp("N");
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-N' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("'unsafe-inline' appears on exactly the two ruled style sub-directives and nowhere else; never 'unsafe-eval'", () => {
    const csp = buildCsp("N");
    const carriers = csp
      .split("; ")
      .filter((d) => d.includes("unsafe-inline"))
      .map((d) => d.split(" ")[0]);
    expect(carriers).toEqual(["style-src-attr", "style-src-elem"]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("a different nonce changes only the nonce-bearing directives", () => {
    const csp = buildCsp("OTHER");
    expect(csp).toContain("'nonce-OTHER'");
    expect(csp).not.toContain("'nonce-TEST_NONCE'");
  });
});

describe("createNonce — a fresh, non-empty value each call", () => {
  it("returns a non-empty base64 string, different on every call", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
