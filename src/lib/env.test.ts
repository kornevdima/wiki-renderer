import { afterEach, describe, expect, it, vi } from "vitest";

async function load(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return (await import("./env")).env;
}

afterEach(() => vi.unstubAllEnvs());

describe("WIKI_PRINT_FILE_TITLE (US-284, US-276)", () => {
  it("is undefined when unset (so the config file decides), false when false, true only when true", async () => {
    vi.stubEnv("WIKI_PRINT_FILE_TITLE", undefined as unknown as string);
    expect((await load({})).WIKI_PRINT_FILE_TITLE).toBeUndefined();
    expect((await load({ WIKI_PRINT_FILE_TITLE: "false" })).WIKI_PRINT_FILE_TITLE).toBe(false);
    expect((await load({ WIKI_PRINT_FILE_TITLE: "true" })).WIKI_PRINT_FILE_TITLE).toBe(true);
  });

  it("refuses anything else, like WIKI_READ_ONLY", async () => {
    await expect(load({ WIKI_PRINT_FILE_TITLE: "yes" }).then((e) => e.WIKI_PRINT_FILE_TITLE)).rejects.toThrow(/WIKI_PRINT_FILE_TITLE/);
  });
});

describe("WIKI_DIRS (US-276)", () => {
  it("is optional: unset and blank both read as not set", async () => {
    expect((await load({ WIKI_DIRS: "" })).WIKI_DIRS).toBeUndefined();
    expect((await load({ WIKI_DIRS: "n=/tmp/n" })).WIKI_DIRS).toBe("n=/tmp/n");
  });
});
