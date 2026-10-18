import { describe, expect, it } from "vitest";

import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("uses binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(52428800)).toBe("50 MiB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GiB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MiB");
  });
  it("is safe on bad input", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
