import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runStart, serverEnv, waitForServer, type ServerProcess, type StartDeps } from "./start";

import type { PortPlan } from "./port-plan";

const fixed = (port: number): PortPlan => ({ kind: "fixed", port, source: "--port" });
const RANGE: PortPlan = { kind: "range", first: 4700, last: 4709 };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wr-start-"));
  await writeFile(path.join(dir, "server.js"), "");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeChild() {
  const handlers: Record<string, (...a: never[]) => void> = {};
  const child: ServerProcess & { exit(code: number | null): void; killed: string[]; ignoresTerm: boolean } = {
    killed: [],
    on(event: string, listener: (...a: never[]) => void) {
      handlers[event] = listener;
      return child;
    },
    ignoresTerm: false,
    kill(signal?: NodeJS.Signals) {
      child.killed.push(signal ?? "SIGTERM");
      if (signal === "SIGKILL" || !child.ignoresTerm) queueMicrotask(() => child.exit(null));
      return true;
    },
    exit(code: number | null) {
      (handlers.exit as unknown as (c: number | null, s: null) => void)(code, null);
    },
  } as never;
  return child;
}

function deps(overrides: Partial<StartDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const child = fakeChild();
  const spawnServer = vi.fn<StartDeps["spawnServer"]>(() => child);
  const openUrl = vi.fn();
  let stop: () => void = () => undefined;
  const base: StartDeps = {
    installDir: dir,
    nodePath: "/bundled/node",
    version: "1.2.3",
    env: { PATH: "/bin", HOSTNAME: "my-machine", PORT: "9" },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    probe: async () => ({ free: true }),
    spawnServer,
    waitReady: async () => true,
    openUrl,
    onStop: (s) => {
      stop = s;
    },
    ...overrides,
  };
  return { base, out, err, child, spawnServer, openUrl, stop: () => stop() };
}

describe("serverEnv", () => {
  it("forces loopback and the port over whatever the shell exports", () => {
    expect(serverEnv({ HOSTNAME: "my-machine", PORT: "9", PATH: "/bin" }, 3310)).toEqual({ HOSTNAME: "127.0.0.1", PORT: "3310", PATH: "/bin" });
  });

  it("asks the app for warnings only when quiet, unless the person set LOG_LEVEL, and never when verbose", () => {
    expect(serverEnv({}, 1, true).LOG_LEVEL).toBe("warn");
    expect(serverEnv({ LOG_LEVEL: "debug" }, 1, true).LOG_LEVEL).toBe("debug");
    expect(serverEnv({ LOG_LEVEL: " " }, 1, true).LOG_LEVEL).toBe("warn");
    expect(serverEnv({}, 1, false).LOG_LEVEL).toBeUndefined();
  });
});

describe("runStart", () => {
  it("prints one line and exits 1 when the port is busy, without starting the server", async () => {
    const d = deps({ probe: async () => ({ free: false, code: "EADDRINUSE" }) });
    expect(await runStart({ plan: fixed(3000), open: true }, d.base)).toBe(1);
    expect(d.err).toEqual(["Port 3000 is in use. Try --port <other>."]);
    expect(d.out).toEqual([]);
    expect(d.spawnServer).not.toHaveBeenCalled();
    expect(d.openUrl).not.toHaveBeenCalled();
  });

  it("runs the bundled node on server.js in the install folder with HOSTNAME and PORT, then opens the browser", async () => {
    const d = deps();
    const run = runStart({ plan: fixed(3310), open: true }, d.base);
    await vi.waitFor(() => expect(d.openUrl).toHaveBeenCalledWith("http://127.0.0.1:3310"));
    expect(d.spawnServer).toHaveBeenCalledWith("/bundled/node", [path.join(dir, "server.js")], {
      cwd: dir,
      env: { PATH: "/bin", HOSTNAME: "127.0.0.1", PORT: "3310", LOG_LEVEL: "warn" },
      quiet: true,
    });
    expect(d.out).toEqual(["Wiki Renderer 1.2.3 is running at http://127.0.0.1:3310. Press Ctrl+C to stop."]);
    d.child.exit(0);
    expect(await run).toBe(0);
  });

  it("does not open the browser with --no-open", async () => {
    const d = deps();
    const run = runStart({ plan: fixed(3000), open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    expect(d.openUrl).not.toHaveBeenCalled();
    d.child.exit(0);
    await run;
  });

  it("stops the server on Ctrl+C and exits 0; a crash passes its code on", async () => {
    const d = deps();
    const run = runStart({ plan: fixed(3000), open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    d.stop();
    expect(await run).toBe(0);
    expect(d.child.killed).toEqual(["SIGTERM"]);

    const crash = deps();
    const second = runStart({ plan: fixed(3000), open: false }, crash.base);
    await vi.waitFor(() => expect(crash.spawnServer).toHaveBeenCalled());
    crash.child.exit(3);
    expect(await second).toBe(3);
  });

  it("says so when server.js is missing", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "wr-start-empty-"));
    const d = deps({ installDir: empty });
    expect(await runStart({ plan: fixed(3000), open: true }, d.base)).toBe(1);
    expect(d.err[0]).toMatch(/Could not find the app server/);
    await rm(empty, { recursive: true, force: true });
  });
});

describe("--verbose", () => {
  it("starts the server with its own output and no LOG_LEVEL", async () => {
    const d = deps();
    const run = runStart({ plan: fixed(4800), open: false, verbose: true }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    const options = d.spawnServer.mock.calls[0]![2];
    expect(options.quiet).toBe(false);
    expect(options.env.LOG_LEVEL).toBeUndefined();
    d.child.exit(0);
    await run;
  });
});

describe("the default port and its fallback", () => {
  it("uses 4700 when it is free, with no notice", async () => {
    const d = deps();
    const run = runStart({ plan: RANGE, open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    expect(d.spawnServer.mock.calls[0]![2].env.PORT).toBe("4700");
    expect(d.out[0]).toMatch(/127\.0\.0\.1:4700\./);
    d.child.exit(0);
    await run;
  });

  it("moves to the next free port, says so, and gives the server that port", async () => {
    const busy = new Set([4700, 4701]);
    const d = deps({ probe: async (p) => (busy.has(p) ? { free: false, code: "EADDRINUSE" } : { free: true }) });
    const run = runStart({ plan: RANGE, open: true }, d.base);
    await vi.waitFor(() => expect(d.openUrl).toHaveBeenCalledWith("http://127.0.0.1:4702"));
    expect(d.out).toEqual(["Port 4700 is in use, using 4702.", "Wiki Renderer 1.2.3 is running at http://127.0.0.1:4702. Press Ctrl+C to stop."]);
    expect(d.spawnServer.mock.calls[0]![2].env).toMatchObject({ PORT: "4702", HOSTNAME: "127.0.0.1" });
    d.child.exit(0);
    await run;
  });

  it("prints one line and exits 1 when all ten are taken", async () => {
    const d = deps({ probe: async () => ({ free: false, code: "EADDRINUSE" }) });
    expect(await runStart({ plan: RANGE, open: true }, d.base)).toBe(1);
    expect(d.err).toEqual(["Ports 4700 to 4709 are all in use. Try --port <other>."]);
    expect(d.spawnServer).not.toHaveBeenCalled();
  });

  it("never moves a fixed port", async () => {
    const tried: number[] = [];
    const d = deps({
      probe: async (p) => {
        tried.push(p);
        return { free: false, code: "EADDRINUSE" };
      },
    });
    expect(await runStart({ plan: { kind: "fixed", port: 4700, source: "config" }, open: true }, d.base)).toBe(1);
    expect(tried).toEqual([4700]);
    expect(d.err).toEqual(["Port 4700 is in use. Try --port <other>."]);
  });
});

describe("a bind failure after the probe passed", () => {
  it("adds one line after the server's own output and passes the exit code on", async () => {
    const d = deps({ waitReady: () => new Promise(() => undefined) });
    const run = runStart({ plan: fixed(4800), open: true }, d.base);
    await vi.waitFor(() => expect(d.spawnServer).toHaveBeenCalled());
    d.child.exit(1);
    expect(await run).toBe(1);
    expect(d.err).toEqual(["Could not start on port 4800. Is it in use? Try --port <other>."]);
  });

  it("stays quiet when the server exits after it was ready", async () => {
    const d = deps();
    const run = runStart({ plan: fixed(4800), open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    d.child.exit(1);
    expect(await run).toBe(1);
    expect(d.err).toEqual([]);
  });
});

describe("stopping", () => {
  it("sends SIGKILL when the server is still alive after the grace period", async () => {
    let fire: () => void = () => undefined;
    let waited = 0;
    const d = deps({
      schedule: (fn, ms) => {
        fire = fn;
        waited = ms;
        return () => undefined;
      },
    });
    d.child.ignoresTerm = true;
    const run = runStart({ plan: fixed(4800), open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    d.stop();
    expect(d.child.killed).toEqual(["SIGTERM"]);
    expect(waited).toBe(5000);
    fire();
    expect(d.child.killed).toEqual(["SIGTERM", "SIGKILL"]);
    expect(await run).toBe(0);
  });

  it("kills at once on a second signal, and cancels the timer when the server exits", async () => {
    const cancelled = vi.fn();
    const d = deps({ schedule: () => cancelled });
    d.child.ignoresTerm = true;
    const run = runStart({ plan: fixed(4800), open: false }, d.base);
    await vi.waitFor(() => expect(d.out).toHaveLength(1));
    d.stop();
    d.stop();
    expect(d.child.killed).toEqual(["SIGTERM", "SIGKILL"]);
    await run;
    expect(cancelled).toHaveBeenCalled();
  });
});

describe("waitForServer", () => {
  it("resolves true once the URL answers ok and false after the wait", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      if (calls < 3) throw new Error("refused");
      return { ok: true };
    }) as unknown as typeof fetch;
    expect(await waitForServer("http://x", 5000, fetchFn)).toBe(true);
    expect(calls).toBe(3);
    const never = (async () => {
      throw new Error("refused");
    }) as unknown as typeof fetch;
    expect(await waitForServer("http://x", 300, never)).toBe(false);
  });
});
