import { describe, expect, it } from "vitest";

import { isLiteralValue } from "./frontmatter-literal";

describe("isLiteralValue (US-218)", () => {
  it.each(["US-218", "FR-024", "NFR-013", "ADR-020", "2026-10-07", "2026-10-07T18:10:26Z", "2026-10-07 18:10", "8d7be8c", "1ae1d83", "d4d5b5f7", "eb0ab78f2d3c4a5b6c7d8e9f0a1b2c3d4e5f6a7b", " US-218 "])(
    "treats %j as literal",
    (value) => {
      expect(isLiteralValue(value)).toBe(true);
    },
  );

  it.each(["", "Plain Page", "The Rendering pipeline", "us-218", "US-", "US-218 follows", "26-10-07", "deadbee1deadbee1deadbee1deadbee1deadbee1ff", "abcdef", "Facade", "defaced", "1234567"])(
    "does not treat %j as literal",
    (value) => {
      expect(isLiteralValue(value)).toBe(false);
    },
  );
});
