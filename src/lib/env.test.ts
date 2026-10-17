import { afterEach, describe, expect, it, vi } from "vitest";

async function load(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("WIKI_DIRS", "w=/tmp/w");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return (await import("./env")).env.WIKI_PRINT_FILE_TITLE;
}

afterEach(() => vi.unstubAllEnvs());

describe("WIKI_PRINT_FILE_TITLE (US-284)", () => {
  it("is false when unset and when false, true only when true", async () => {
    expect((await load({}))).toBe(false);
    expect((await load({ WIKI_PRINT_FILE_TITLE: "false" }))).toBe(false);
    expect((await load({ WIKI_PRINT_FILE_TITLE: "true" }))).toBe(true);
  });

  it("refuses anything else, like WIKI_READ_ONLY", async () => {
    await expect(load({ WIKI_PRINT_FILE_TITLE: "yes" })).rejects.toThrow(/WIKI_PRINT_FILE_TITLE/);
  });
});
