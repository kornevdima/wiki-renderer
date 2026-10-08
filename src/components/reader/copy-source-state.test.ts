import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-source-state";

describe("copyText (D3)", () => {
  it("writes the exact string, CRLF included, and resolves true", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText("a\r\nb\r\n", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("a\r\nb\r\n");
  });
  it("resolves false, silently, when the write is rejected or there is no clipboard", async () => {
    expect(await copyText("x", { writeText: async () => Promise.reject(new Error("denied")) })).toBe(false);
    expect(await copyText("x", undefined)).toBe(false);
  });
});
