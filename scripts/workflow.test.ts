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
    const steps = ["scripts/package.mjs", "ci-tools.mjs unpack", "portable-contents.test.ts", "playwright install", "scripts/smoke.mjs", "scripts/install-check.mjs", "upload-artifact"].map((p) => indexOf(pack, new RegExp(p.replace(/[.]/g, "\\."))));
    expect(steps.every((i) => i >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it("runs the one-line installer on its own archive after the smoke and before the upload (US-279 R7)", () => {
    const step = pack.steps[indexOf(pack, /scripts\/install-check\.mjs/)];
    expect(step?.name).toBe("Test the one-line installer");
    expect(step?.run).toContain("release/out/wiki-renderer-${VERSION}-${PLATFORM}-${ARCH}.*");
    expect(step?.run).toContain('--version "$VERSION"');
    expect(step?.run).not.toMatch(/\$\{\{/);
  });

  it("checks on Windows that an unexpanded user PATH entry survives, on a throwaway registry value and never the real Path (US-279)", () => {
    const script = readFileSync(path.resolve("scripts/install-check.mjs"), "utf8");
    expect(script).toContain('const TEST_PATH_VALUE = "WikiRendererTestPath"');
    expect(script).toContain("WIKI_RENDERER_PATH_VALUE_NAME = TEST_PATH_VALUE");
    expect(script).toContain("%USERPROFILE%");
    expect(script).toContain("fake-dir");
    expect(script).toContain("RegistryValueKind]::ExpandString");
    expect(script).toContain("DoNotExpandEnvironmentNames");
    expect(script).toMatch(/DeleteValue\('\$\{TEST_PATH_VALUE\}'/);
    expect(script).toContain('"--bogus"');
    expect(script).toContain("bogus.status !== 2");
    expect(script).not.toMatch(/GetValue\('Path'|SetValue\('Path'/);
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
