import { describe, expect, it, vi } from "vitest";
import { ANCHOR_CUE_MS, anchorUrl, copyLink } from "./copy-link";

describe("copyLink (US-219, TC-506)", () => {
  it("is copied when writeText resolves, and writes exactly the url", async () => {
    const writeText = vi.fn(async () => {});
    await expect(copyLink("https://x.test/w/a/P.md#user-content-s", { writeText })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledExactlyOnceWith("https://x.test/w/a/P.md#user-content-s");
  });
  it("is failed, with nothing thrown, for no clipboard at all (an insecure context)", async () => {
    await expect(copyLink("u", undefined)).resolves.toBe("failed");
    await expect(copyLink("u", null)).resolves.toBe("failed");
  });
  it("is failed when writeText throws synchronously", async () => {
    const writeText = () => {
      throw new TypeError("denied");
    };
    await expect(copyLink("u", { writeText })).resolves.toBe("failed");
  });
  it("is failed when writeText rejects with NotAllowedError", async () => {
    const writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    await expect(copyLink("u", { writeText })).resolves.toBe("failed");
  });
  it("never reports success for a write that never settles", async () => {
    const result = await Promise.race([copyLink("u", { writeText: () => new Promise<void>(() => {}) }), new Promise((r) => setTimeout(() => r("pending"), 20))]);
    expect(result).toBe("pending");
  });
  it("uses no execCommand fallback", async () => {
    const execCommand = vi.fn();
    vi.stubGlobal("document", { execCommand });
    try {
      await copyLink("u", undefined);
      await copyLink("u", { writeText: () => Promise.reject(new Error("no")) });
      expect(execCommand).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("shows the cue for two seconds", () => {
    expect(ANCHOR_CUE_MS).toBe(2000);
  });
});

describe("anchorUrl", () => {
  it("replaces the page's own fragment with the anchor's", () => {
    expect(anchorUrl("https://x.test/w/a/P.md#old", "#user-content-s")).toBe("https://x.test/w/a/P.md#user-content-s");
    expect(anchorUrl("https://x.test/w/a/P.md", "#user-content-s")).toBe("https://x.test/w/a/P.md#user-content-s");
  });
  it("keeps the path's query as it was (the page address, never a view the anchor does not exist in)", () => {
    expect(anchorUrl("https://x.test/w/a/P.md?x=1#old", "#s")).toBe("https://x.test/w/a/P.md?x=1#s");
  });
  it("adds the # when the href has none", () => {
    expect(anchorUrl("https://x.test/p", "s")).toBe("https://x.test/p#s");
  });
});
