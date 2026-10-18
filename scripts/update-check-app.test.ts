// US-279 R8 / R9 on the real installed app: an unpacked archive started with the real launcher (the bundled Node, no Node on
// the PATH) against a request logger standing in for the GitHub releases API (ports 3326-3329). Like portable-contents.test.ts
// it needs an unpacked archive, so it runs when WR_UNPACKED names the top folder and is skipped without it.
//   R8  no flag, no env: the logger sees zero requests and no update-check.json is written.
//   R9  on: one plain GET with a User-Agent, one notice line, the cache beside config.json; same version: silence.
//   R9  a 10 s API never delays startup: the running line is out before the request is answered, and Ctrl+C ends the process at once.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const unpacked = process.env.WR_UNPACKED;
const APP_PORT_FIRST = 3326;

interface Logged {
  url: string;
  userAgent: string | undefined;
  method: string | undefined;
  headers: string[];
  answered: boolean;
}

let tmp: string;
let api: http.Server | undefined;
let logged: Logged[];
let apiBase: string;
const children: ReturnType<typeof spawn>[] = [];

async function listen(server: http.Server, from: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = from;
    const attempt = () => {
      server.once("error", (e: NodeJS.ErrnoException) => (e.code === "EADDRINUSE" && port < 3329 ? ((port += 1), attempt()) : reject(e)));
      server.listen(port, "127.0.0.1", () => resolve(port));
    };
    attempt();
  });
}

async function startApi(respond: (res: http.ServerResponse) => void): Promise<number> {
  logged = [];
  api = http.createServer((req, res) => {
    const entry: Logged = { url: req.url ?? "", userAgent: req.headers["user-agent"], method: req.method, headers: Object.keys(req.headers).sort(), answered: false };
    logged.push(entry);
    res.on("finish", () => (entry.answered = true));
    respond(res);
  });
  const port = await listen(api, APP_PORT_FIRST);
  apiBase = `http://127.0.0.1:${port}/api`;
  return port;
}

const answerWith = (tag: string) => (res: http.ServerResponse) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tag_name: tag }));

interface Running {
  out: () => string;
  ready: Promise<number>;
  exited: Promise<number | null>;
  child: ReturnType<typeof spawn>;
  port: number;
}

/** Starts the launcher with a minimal environment: no Node on the PATH, a temp config, the API seam at the logger. */
function start(args: string[], env: Record<string, string>, appPort: number): Running {
  const child = spawn(path.join(unpacked!, "wiki-renderer"), ["--no-open", "--port", String(appPort), ...args], {
    env: { HOME: tmp, PATH: "/usr/bin:/bin", WIKI_RENDERER_CONFIG: path.join(tmp, "config", "config.json"), WIKI_RENDERER_API_BASE: apiBase, ...env } as unknown as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.push(child);
  let out = "";
  const started = Date.now();
  const ready = new Promise<number>((resolve, reject) => {
    const check = () => {
      if (/is running at/.test(out)) resolve(Date.now() - started);
    };
    child.stdout!.on("data", (d: Buffer) => ((out += d), check()));
    child.stderr!.on("data", (d: Buffer) => ((out += d), check()));
    child.once("exit", () => reject(new Error(`exited before it was running:\n${out}`)));
  });
  ready.catch(() => undefined);
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return { out: () => out, ready, exited, child, port: appPort };
}

const stop = async (run: Running) => {
  if (run.child.exitCode === null) process.kill(-run.child.pid!, "SIGINT"); // Ctrl+C reaches the launcher's whole group
  return run.exited;
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!unpacked || process.platform === "win32")("update check in the installed app (WR_UNPACKED)", () => {
  let current = "";
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "wr-upd-"));
    current = (JSON.parse(await readFile(path.join(unpacked!, "package.json"), "utf8")) as { version: string }).version;
  });
  afterEach(async () => {
    for (const child of children.splice(0)) if (child.exitCode === null) process.kill(-child.pid!, "SIGKILL");
    await new Promise((resolve) => (api ? api.closeAllConnections?.() ?? resolve(undefined) : resolve(undefined)));
    await new Promise((resolve) => (api ? api.close(() => resolve(undefined)) : resolve(undefined)));
    api = undefined;
    await rm(tmp, { recursive: true, force: true });
  });

  it("R8: with no flag and no variable the app makes no request to the API and writes no cache", async () => {
    await startApi(answerWith("v999.0.0"));
    const run = start([], {}, 3328);
    await run.ready;
    await pause(3500); // longer than the 2 s request timeout: a check that was going to happen would have arrived by now
    expect(logged).toEqual([]);
    expect(run.out()).not.toMatch(/is available/);
    await stop(run);
    await expect(readFile(path.join(tmp, "config", "update-check.json"), "utf8")).rejects.toThrow();
  }, 30_000);

  const modes: Array<{ name: string; args: string[]; env: Record<string, string> }> = [
    { name: "--check-updates", args: ["--check-updates"], env: {} },
    { name: "WIKI_RENDERER_UPDATE_CHECK=1", args: [], env: { WIKI_RENDERER_UPDATE_CHECK: "1" } },
  ];
  for (const how of modes) {
    it(`R9: with ${how.name} and a newer release: one plain GET, one notice line, the cache written beside config.json`, async () => {
      await startApi(answerWith("v999.0.0"));
      const run = start(how.args, how.env, 3328);
      await run.ready;
      await expect.poll(() => run.out().includes("is available"), { timeout: 10_000 }).toBe(true);
      expect(run.out().match(/is available/g)).toHaveLength(1);
      expect(run.out()).toContain(`Wiki Renderer 999.0.0 is available (you have ${current}). Update: `);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ url: "/api/releases/latest", method: "GET", userAgent: `wiki-renderer/${current}` });
      expect(logged[0]!.headers.filter((h) => /cookie|authorization|x-/.test(h))).toEqual([]); // nothing about the machine or the wikis
      const cache = JSON.parse(await readFile(path.join(tmp, "config", "update-check.json"), "utf8")) as { latest: string; checkedAt: string };
      expect(cache.latest).toBe("999.0.0");
      expect(Number.isNaN(Date.parse(cache.checkedAt))).toBe(false);
      await stop(run);
    }, 30_000);
  }

  it("R9: with the check on and the same version released the app says nothing, and a second start within a day makes no second request", async () => {
    await startApi(answerWith(`v${current}`));
    const first = start(["--check-updates"], {}, 3328);
    await first.ready;
    await expect.poll(() => logged.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => logged[0]!.answered).toBe(true);
    await stop(first);
    expect(first.out()).not.toMatch(/is available/);
    const second = start(["--check-updates"], {}, 3328);
    await second.ready;
    await pause(1500);
    expect(logged).toHaveLength(1);
    await stop(second);
  }, 40_000);

  it("R9: a 10 s API never delays startup: the running line is out before the request is answered, nothing is printed, and Ctrl+C ends the process at once", async () => {
    await startApi(() => undefined); // never answers: the request hangs until the app gives up
    const run = start(["--check-updates"], {}, 3328);
    await run.ready;
    await expect.poll(() => logged.length, { timeout: 10_000 }).toBe(1); // the check started after the running line
    expect(logged[0]!.answered).toBe(false);
    expect(run.out().indexOf("is running at")).toBeGreaterThan(-1);
    const health = await fetch(`http://127.0.0.1:${run.port}/api/health`);
    expect(health.ok).toBe(true); // the app serves while the check is pending
    const began = Date.now();
    const code = await stop(run);
    expect(Date.now() - began).toBeLessThan(5000); // not held for the 10 s
    expect(code).toBe(0);
    expect(run.out()).not.toMatch(/is available/);
    await expect(readFile(path.join(tmp, "config", "update-check.json"), "utf8")).rejects.toThrow(); // a failed check caches nothing
  }, 40_000);
});
