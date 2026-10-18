import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readVersion, UNKNOWN_VERSION } from "./version";

describe("readVersion", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "wr-version-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the version field of package.json", async () => {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.2.0" }));
    expect(readVersion(dir)).toBe("0.2.0");
  });

  it("reads this repository's package.json", () => {
    expect(readVersion(process.cwd())).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("answers unknown for a missing file, bad JSON or a missing or non-string version", async () => {
    expect(readVersion(dir)).toBe(UNKNOWN_VERSION);
    await writeFile(path.join(dir, "package.json"), "{not json");
    expect(readVersion(dir)).toBe(UNKNOWN_VERSION);
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ version: 3 }));
    expect(readVersion(dir)).toBe(UNKNOWN_VERSION);
    await writeFile(path.join(dir, "package.json"), "null");
    expect(readVersion(dir)).toBe(UNKNOWN_VERSION);
  });
});
