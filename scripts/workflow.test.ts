// The shape the contract rules for .github/workflows/release.yml (US-278 R9). The live run waits for a pushed tag.
import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
}
interface Job {
  needs?: string | string[];
  "runs-on"?: string;
  permissions?: Record<string, string>;
  steps: Step[];
  strategy?: { "fail-fast"?: boolean; matrix: { include: Array<{ runner: string; platform: string; arch: string }> } };
}
const workflow = parse(readFileSync(path.resolve(".github/workflows/release.yml"), "utf8")) as {
  on: { push: { tags: string[] } };
  permissions: Record<string, string>;
  env: Record<string, string>;
  jobs: Record<string, Job>;
};
const { build, package: pack, release } = workflow.jobs;
const needs = (job: Job) => [job.needs ?? []].flat();
const indexOf = (job: Job, pattern: RegExp) => job.steps.findIndex((s) => pattern.test(`${s.name ?? ""} ${s.run ?? ""} ${s.uses ?? ""}`));

describe("release workflow", () => {
  it("runs on version tags only, with read-only permissions by default", () => {
    expect(workflow.on.push.tags).toEqual(["v*.*.*"]);
    expect(Object.keys(workflow.on)).toEqual(["push"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("pins one Node runtime version", () => {
    expect(workflow.env.NODE_VERSION).toMatch(/^24\.\d+\.\d+$/);
  });

  it("builds once with typecheck, lint, unit tests and the build before staging", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["build", "package", "release"]);
    const order = [/npm run typecheck/, /npm run lint/, /npm test/, /npm run build\b/, /--stage-only/, /upload-artifact/].map((p) => indexOf(build, p));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("packages on the five native runners", () => {
    expect(needs(pack)).toEqual(["build"]);
    expect(pack.strategy?.matrix.include.map((m) => `${m.runner} ${m.platform}-${m.arch}`)).toEqual([
      "macos-latest darwin-arm64",
      "macos-15-intel darwin-x64",
      "ubuntu-latest linux-x64",
      "ubuntu-24.04-arm linux-arm64",
      "windows-latest win-x64",
    ]);
    expect(pack["runs-on"]).toBe("${{ matrix.runner }}");
  });

  it("unpacks into a fresh folder and smoke-tests before the archive is uploaded", () => {
    const steps = ["scripts/package.mjs", "ci-tools.mjs unpack", "portable-contents.test.ts", "playwright install", "scripts/smoke.mjs", "upload-artifact"].map((p) => indexOf(pack, new RegExp(p.replace(/[.]/g, "\\."))));
    expect(steps.every((i) => i >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it("publishes only after all five package jobs, with write access on that job alone", () => {
    expect(needs(release).sort()).toEqual(["build", "package"]);
    expect(release.permissions).toEqual({ contents: "write" });
    expect(build.permissions).toBeUndefined();
    expect(pack.permissions).toBeUndefined();
    const text = release.steps.map((s) => s.run ?? "").join("\n");
    expect(text).toMatch(/-eq 5/);
    expect(text).toMatch(/SHA256SUMS/);
    expect(text).toMatch(/gh release create/);
  });

  it("downloads Node through the checksum-verifying script, never a bare curl", () => {
    const all = JSON.stringify(workflow.jobs);
    expect(all).toContain("ci-tools.mjs fetch-node");
    expect(all).not.toMatch(/curl|wget/);
  });
});
