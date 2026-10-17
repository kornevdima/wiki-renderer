import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildCsp } from "@/lib/security-headers";

const HERE = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(HERE, "layout.tsx"), "utf8");
const prose = readFileSync(join(HERE, "wr-prose.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the stored page width reaches <html> as an inline style attribute (US-280)", () => {
  it("the root layout emits it, so the CSP must keep `style-src-attr 'unsafe-inline'` (no inline <style> or script is used instead)", () => {
    // `--wr-page-px` is set through React's `style` prop on <html> so the first paint already has the width. A style attribute is
    // governed by `style-src-attr`; if that allowance is ever removed, move the width to a nonce'd <style> before removing it.
    expect(layout).toMatch(/style=\{htmlStyle\}/);
    expect(layout).toMatch(/"--wr-page-px"/);
    const csp = buildCsp("abc");
    expect(csp).toMatch(/(^|; )style-src-attr 'unsafe-inline'(;|$)/);
  });
});

describe("the width handle's host does not take the article's first or last place (US-280)", () => {
  it("the article's first and last block rules skip the host, so its DOM order does not matter", () => {
    expect(prose).toMatch(/\.wr-prose > :nth-child\(1 of :not\(\.wr-width-track\)\)\s*\{\s*margin-top:\s*0/);
    expect(prose).toMatch(/\.wr-prose > :nth-last-child\(1 of :not\(\.wr-width-track\)\)\s*\{\s*margin-bottom:\s*0/);
    expect(prose).not.toMatch(/\.wr-prose > :(first|last)-child/);
  });
});
