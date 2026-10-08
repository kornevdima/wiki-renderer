import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

/**
 * US-192 review r1: the pie-slice colours in `wr-prose.css` pair `--diagram-pie-*` with Mermaid's output by `nth-of-type`
 * order, which is a property of the drawn markup of one Mermaid version. A bump must be a conscious act.
 */
const PINNED = "12.0.0";

describe("mermaid version pin (US-192)", () => {
  it("the installed mermaid is the version the pie nth-of-type pairing in wr-prose.css was checked against", () => {
    const require = createRequire(import.meta.url);
    const manifest = require.resolve("mermaid/package.json");
    const installed = (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
    expect(
      installed,
      `mermaid is ${installed}, this was checked against ${PINNED}: re-check the pie nth-of-type pairing in src/app/wr-prose.css (draw a pie, compare slice order with the legend), then update PINNED here`,
    ).toBe(PINNED);
  });
});
