import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { parse } from "yaml";

import { COMMITTED_SHA_FILE, committedSha, expectedSha, nodeDistName, sha256Of } from "./lib/node-dist.mjs";

const SUMS = `
${"a".repeat(64)}  node-v24.22.0-darwin-arm64.tar.gz
${"b".repeat(64)}  node-v24.22.0-win-x64.zip
${"c".repeat(64)} *node-v24.22.0-linux-x64.tar.gz
`;

describe("node-dist", () => {
  it("names the download as nodejs.org does", () => {
    expect(nodeDistName("24.22.0", "darwin", "arm64")).toBe("node-v24.22.0-darwin-arm64.tar.gz");
    expect(nodeDistName("24.22.0", "win", "x64")).toBe("node-v24.22.0-win-x64.zip");
  });
  it("reads the expected sha256 for one file from SHASUMS256.txt", () => {
    expect(expectedSha(SUMS, "node-v24.22.0-win-x64.zip")).toBe("b".repeat(64));
    expect(expectedSha(SUMS, "node-v24.22.0-linux-x64.tar.gz")).toBe("c".repeat(64));
    expect(expectedSha(SUMS, "node-v24.22.0-linux-arm64.tar.gz")).toBeNull();
    expect(expectedSha("", "x")).toBeNull();
  });
  it("hashes bytes", () => {
    expect(sha256Of(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("committed Node hashes", () => {
  const table = JSON.parse(readFileSync(COMMITTED_SHA_FILE, "utf8"));
  const workflow = parse(readFileSync(".github/workflows/release.yml", "utf8")) as { env: { NODE_VERSION: string }; jobs: { package: { strategy: { matrix: { include: Array<{ platform: string; arch: string }> } } } } };
  const version = workflow.env.NODE_VERSION;

  it("covers every platform in the release matrix for the pinned Node version", () => {
    for (const { platform, arch } of workflow.jobs.package.strategy.matrix.include) {
      expect(committedSha(table, version, platform, arch), `${platform}-${arch}`).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it("returns null for a version or platform that is not committed", () => {
    expect(committedSha(table, "1.0.0", "linux", "x64")).toBeNull();
    expect(committedSha(table, version, "freebsd", "x64")).toBeNull();
  });
});
