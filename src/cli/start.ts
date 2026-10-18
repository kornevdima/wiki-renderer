import { existsSync } from "node:fs";
import path from "node:path";

import { cliCopy } from "./copy";
import { portProblemMessage, probePort } from "./port";
import { candidatePorts, type PortPlan } from "./port-plan";

/** Minimal shapes of what `start` needs from Node, so a test can inject them. */
export interface ServerProcess {
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface StartDeps {
  installDir: string;
  nodePath: string;
  version: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  probe?: typeof probePort;
  spawnServer: (command: string, args: string[], options: { cwd: string; env: Record<string, string | undefined>; quiet: boolean }) => ServerProcess;
  /** Resolves true once the server answers; false when it did not within the wait. */
  waitReady: (url: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  /** Called once the server answers, after the "is running" line (the update check of US-279 hangs here). Must not throw. */
  onReady?: () => void;
  onStop: (stop: () => void) => void;
  /** Runs `fn` after `ms`; returns a canceller. The stop escalation uses it. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

/** How long a server gets to stop after SIGTERM before SIGKILL. */
export const STOP_GRACE_MS = 5000;

const realSchedule = (fn: () => void, ms: number): (() => void) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/** The environment the app server gets: loopback only (Next's own default is 0.0.0.0) and the port Settings checks the Host against. */
export function serverEnv(base: Record<string, string | undefined>, port: number, quiet = false): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, HOSTNAME: "127.0.0.1", PORT: String(port) };
  // Quiet start: the app's logger prints INFO unless told otherwise; a LOG_LEVEL the person set is theirs.
  if (quiet && !env.LOG_LEVEL?.trim()) env.LOG_LEVEL = "warn";
  return env;
}

/** Polls `url` until it answers 200 or `timeoutMs` passes. */
export async function waitForServer(url: string, timeoutMs = 30_000, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchFn(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

/**
 * `start`: pick the port (a fixed one that is busy is one line and exit 1; the default moves to the next free one up to
 * 4709 and says so), run `server.js` on 127.0.0.1, open the browser, stop on Ctrl+C. Resolves to the exit code.
 */
export async function runStart(opts: { plan: PortPlan; open: boolean; verbose?: boolean }, deps: StartDeps): Promise<number> {
  const serverFile = path.join(deps.installDir, "server.js");
  if (!existsSync(serverFile)) {
    deps.err(cliCopy.serverMissing);
    return 1;
  }
  const candidates = candidatePorts(opts.plan);
  let port: number | undefined;
  let lastCode: string | undefined;
  for (const candidate of candidates) {
    const probed = await (deps.probe ?? probePort)(candidate);
    if (probed.free) {
      port = candidate;
      break;
    }
    lastCode = probed.code;
  }
  if (port === undefined) {
    deps.err(
      opts.plan.kind === "fixed" ? portProblemMessage(opts.plan.port, lastCode) : cliCopy.allBusy(opts.plan.first, opts.plan.last),
    );
    return 1;
  }
  if (opts.plan.kind === "range" && port !== opts.plan.first) deps.out(cliCopy.fellBack(opts.plan.first, port));

  const url = `http://127.0.0.1:${port}`;
  const child = deps.spawnServer(deps.nodePath, [serverFile], { cwd: deps.installDir, env: serverEnv(deps.env, port, !opts.verbose), quiet: !opts.verbose });
  let stopping = false;
  let ready = false;
  let signals = 0;
  let cancelKill: (() => void) | undefined;
  deps.onStop(() => {
    stopping = true;
    signals += 1;
    if (signals === 1) {
      child.kill("SIGTERM");
      cancelKill = (deps.schedule ?? realSchedule)(() => child.kill("SIGKILL"), STOP_GRACE_MS);
    } else {
      child.kill("SIGKILL");
    }
  });

  const exited = new Promise<number>((resolve) => {
    child.on("error", (error) => {
      deps.err(error.message);
      resolve(1);
    });
    child.on("exit", (code) => {
      cancelKill?.();
      // The probe passed but the server could not bind (a race, or a holder the probe cannot see): Next's own output is a
      // multi-line error, so end with one line the person can act on.
      if (!stopping && !ready && code !== 0) deps.err(cliCopy.bindFailed(port));
      resolve(stopping ? 0 : (code ?? 1));
    });
  });

  void deps.waitReady(`${url}/api/health`).then((ok) => {
    if (!ok || stopping) return;
    ready = true;
    deps.out(cliCopy.running(deps.version, url));
    if (opts.open) deps.openUrl(url);
    deps.onReady?.();
  });

  return exited;
}
