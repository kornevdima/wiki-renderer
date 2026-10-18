import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHECK_INTERVAL_MS,
  compareVersions,
  installLine,
  isUpdateCheckEnabled,
  runUpdateCheck,
  updateCachePath,
  updateNotice,
  type UpdateCheckOptions,
} from "./update-check";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wr-update-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const NOW = Date.parse("2026-10-18T10:00:00Z");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(overrides: Partial<UpdateCheckOptions> = {}) {
  const lines: string[] = [];
  const cachePath = path.join(dir, "update-check.json");
  const opts: UpdateCheckOptions = {
    enabled: true,
    current: "0.1.0",
    platform: "darwin",
    cachePath,
    apiBase: "http://127.0.0.1:3321/api",
    now: () => NOW,
    out: (l) => lines.push(l),
    ...overrides,
  };
  return { opts, lines, cachePath };
}

describe("isUpdateCheckEnabled", () => {
  it("is off unless the flag is given or the variable is 1", () => {
    expect(isUpdateCheckEnabled({}, false)).toBe(false);
    expect(isUpdateCheckEnabled({ WIKI_RENDERER_UPDATE_CHECK: "0" }, false)).toBe(false);
    expect(isUpdateCheckEnabled({ WIKI_RENDERER_UPDATE_CHECK: "true" }, false)).toBe(false);
    expect(isUpdateCheckEnabled({ WIKI_RENDERER_UPDATE_CHECK: "1" }, false)).toBe(true);
    expect(isUpdateCheckEnabled({}, true)).toBe(true);
  });
});

describe("compareVersions", () => {
  it("orders releases and prereleases the semver way", () => {
    expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
    expect(compareVersions("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
  });

  it("answers null for anything that is not a version", () => {
    expect(compareVersions("unknown", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", "latest")).toBeNull();
  });
});

describe("the notice", () => {
  it("names both versions and the install line for the OS", () => {
    expect(updateNotice("0.2.0", "0.1.0", "darwin")).toBe(
      "Wiki Renderer 0.2.0 is available (you have 0.1.0). Update: curl -fsSL https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.sh | sh",
    );
    expect(installLine("linux")).toMatch(/install\.sh \| sh$/);
    expect(installLine("win32")).toBe("irm https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.ps1 | iex");
  });

  it("puts the cache beside config.json", () => {
    expect(updateCachePath("/x/y/config.json")).toBe(path.join("/x/y", "update-check.json"));
  });
});

describe("runUpdateCheck", () => {
  it("off: makes no request, reads nothing and writes nothing", async () => {
    const fetchFn = vi.fn(() => {
      throw new Error("a request was made with the check off");
    });
    const { opts, lines, cachePath } = setup({ enabled: false, fetchFn: fetchFn as never });
    await runUpdateCheck(opts);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
    await expect(readFile(cachePath)).rejects.toThrow();
  });

  it("newer: prints the line once, sends a plain GET with only a User-Agent, and writes the cache", async () => {
    const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json({ tag_name: "v0.2.0" }));
    const { opts, lines, cachePath } = setup({ fetchFn: fetchFn as never });
    await runUpdateCheck(opts);
    expect(lines).toEqual([updateNotice("0.2.0", "0.1.0", "darwin")]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:3321/api/releases/latest");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ "User-Agent": "wiki-renderer/0.1.0", Accept: "application/vnd.github+json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toEqual({ checkedAt: new Date(NOW).toISOString(), latest: "0.2.0" });
  });

  it("same or older: says nothing", async () => {
    for (const tag of ["v0.1.0", "v0.0.9"]) {
      const { opts, lines } = setup({ fetchFn: (async () => json({ tag_name: tag })) as never });
      await runUpdateCheck(opts);
      expect(lines, tag).toEqual([]);
    }
  });

  it("an unknown current version never claims an update", async () => {
    const { opts, lines } = setup({ current: "unknown", fetchFn: (async () => json({ tag_name: "v9.0.0" })) as never });
    await runUpdateCheck(opts);
    expect(lines).toEqual([]);
  });

  it("a fresh cache (under 24 h) makes no request but still shows a newer version", async () => {
    const { opts, lines, cachePath } = setup();
    await writeFile(cachePath, JSON.stringify({ checkedAt: new Date(NOW - CHECK_INTERVAL_MS + 60_000).toISOString(), latest: "0.3.0" }));
    const fetchFn = vi.fn();
    await runUpdateCheck({ ...opts, fetchFn: fetchFn as never });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(lines).toEqual([updateNotice("0.3.0", "0.1.0", "darwin")]);
  });

  it("a stale cache (24 h or more), a future one and a broken one all ask again", async () => {
    for (const content of [
      JSON.stringify({ checkedAt: new Date(NOW - CHECK_INTERVAL_MS).toISOString(), latest: "0.1.0" }),
      JSON.stringify({ checkedAt: new Date(NOW + 3600_000).toISOString(), latest: "0.1.0" }),
      "{not json",
      JSON.stringify({ checkedAt: new Date(NOW - 60_000).toISOString(), latest: "banana" }),
      JSON.stringify({ checkedAt: "yesterday", latest: "0.1.0" }),
    ]) {
      const { opts, lines, cachePath } = setup();
      await writeFile(cachePath, content);
      const fetchFn = vi.fn(async () => json({ tag_name: "v0.4.0" }));
      await runUpdateCheck({ ...opts, fetchFn: fetchFn as never });
      expect(fetchFn, content).toHaveBeenCalledTimes(1);
      expect(lines).toEqual([updateNotice("0.4.0", "0.1.0", "darwin")]);
    }
  });

  it("offline, a timeout, a 500, a bad body and a bad tag are all silent and cache nothing", async () => {
    const failures: Array<() => Promise<Response>> = [
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
      async () => json({ message: "boom" }, 500),
      async () => new Response("<html>", { status: 200 }),
      async () => json({ tag_name: 7 }),
      async () => json({ tag_name: "not-a-version" }),
      async () => json(null),
    ];
    for (const fail of failures) {
      const { opts, lines, cachePath } = setup({ fetchFn: fail as never });
      await expect(runUpdateCheck(opts)).resolves.toBeUndefined();
      expect(lines).toEqual([]);
      await expect(readFile(cachePath)).rejects.toThrow();
    }
  });

  it("an unwritable cache folder does not stop the notice", async () => {
    const blocker = path.join(dir, "file");
    await writeFile(blocker, "x");
    const { opts, lines } = setup({ cachePath: path.join(blocker, "sub", "update-check.json"), fetchFn: (async () => json({ tag_name: "v1.0.0" })) as never });
    await runUpdateCheck(opts);
    expect(lines).toEqual([updateNotice("1.0.0", "0.1.0", "darwin")]);
  });

  it("leaves no temp file behind when the rename fails", async () => {
    // The cache path is an existing folder: the write works under the temp name, the rename onto a folder fails.
    const { opts } = setup({ fetchFn: (async () => json({ tag_name: "v1.0.0" })) as never });
    const { mkdir, readdir } = await import("node:fs/promises");
    const folder = path.join(dir, "update-check.json");
    await mkdir(path.join(folder, "inner"), { recursive: true });
    await runUpdateCheck({ ...opts, cachePath: folder });
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("an output function that throws does not escape", async () => {
    const { opts } = setup({
      fetchFn: (async () => json({ tag_name: "v1.0.0" })) as never,
      out: () => {
        throw new Error("closed pipe");
      },
    });
    await expect(runUpdateCheck(opts)).resolves.toBeUndefined();
  });

  it("gives up after the timeout it was given (a request that never answers)", async () => {
    const hang = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as never;
    const { opts, lines } = setup({ fetchFn: hang, timeoutMs: 30 });
    const started = Date.now();
    await runUpdateCheck(opts);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines).toEqual([]);
  });
});
