// Smoke test for an unpacked portable build (US-278): node scripts/smoke.mjs <unpackedDir> [--port 3310] [--expect-version v]
//
// Starts the unpacked launcher (default port, with the next-free fallback) on 127.0.0.1 against a temp config and a copy of the fixture wiki, then checks: --version,
// add / list / remove, a busy fixed port (one line, exit 1), the default port 4700 held so the launcher says it moved to 4701, the loopback-only listener, /, a page, the search index (through the
// browser), /settings with the version footer, one real page save through the editor (Playwright, Chromium), zero requests
// to any host but 127.0.0.1, and a clean stop. Nothing outside a temp folder is written: the real user config is never used.
// Run it on each platform's archive after unpacking into a fresh folder. Needs `npx playwright install chromium` once.
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWin = process.platform === "win32";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { port: 3310, dir: undefined, expectVersion: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port") opts.port = Number(argv[(i += 1)]);
    else if (argv[i] === "--expect-version") opts.expectVersion = argv[(i += 1)];
    else opts.dir = path.resolve(argv[i]);
  }
  if (!opts.dir || !Number.isInteger(opts.port)) throw new Error("Usage: node scripts/smoke.mjs <unpackedDir> [--port 3310] [--expect-version v]");
  return opts;
}

/** The addresses of this machine that are not loopback: the server must refuse connections there. */
export function externalIPv4(interfaces) {
  return Object.values(interfaces)
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok   - ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL - ${name}\n       ${error instanceof Error ? error.message : String(error)}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanEnv(configFile) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(WIKI_|BRAND_|NODE_OPTIONS$|PORT$|HOSTNAME$)/.test(key)) delete env[key];
  }
  // No Node on the PATH: the launcher must use the runtime it ships.
  const root = process.env.SystemRoot ?? "C:\\Windows";
  env.PATH = isWin ? `${root}\\System32;${root}` : "/usr/bin:/bin";
  if (isWin) env.Path = env.PATH;
  env.WIKI_RENDERER_CONFIG = configFile;
  env.WIKI_RECHECK_MS = "0";
  return env;
}

function launcherFile(dir) {
  const file = path.join(dir, isWin ? "wiki-renderer.cmd" : "wiki-renderer");
  return isWin ? `"${file}"` : file; // shell: true on Windows needs the quotes for a path with spaces
}

function runLauncher(dir, args, env, cwd) {
  const result = spawnSync(launcherFile(dir), args, { env, cwd, encoding: "utf8", shell: isWin, timeout: 60_000 });
  return { code: result.status, out: result.stdout ?? "", err: result.stderr ?? "" };
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(2000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not answer in ${ms / 1000} s`);
}

async function main() {
  const { port: fixedPort, dir, expectVersion } = parseArgs(process.argv.slice(2));
  let port = fixedPort;
  let base = "";
  const tmp = await mkdtemp(path.join(os.tmpdir(), "wr-smoke-"));
  const configFile = path.join(tmp, "config", "config.json");
  const sampleDir = path.join(tmp, "sample");
  const secondDir = path.join(tmp, "second");
  await cp(path.join(repoRoot, "tests", "fixtures", "sample-wiki"), sampleDir, { recursive: true });
  await cp(path.join(repoRoot, "tests", "fixtures", "second-wiki"), secondDir, { recursive: true });
  const env = cleanEnv(configFile);
  const installVersion = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).version;
  let server;
  let blocker;
  let defaultBlocker;

  try {
    await step("--version prints the packaged version", () => {
      const r = runLauncher(dir, ["--version"], env, tmp);
      assert(r.code === 0, `exit ${r.code}: ${r.err}`);
      assert(r.out.trim() === installVersion, `printed "${r.out.trim()}", package.json says ${installVersion}`);
      if (expectVersion !== undefined) assert(installVersion === expectVersion, `expected ${expectVersion}`);
    });

    await step("add, list and remove round-trip on the temp config (relative folder, from the shell's folder)", () => {
      const add = runLauncher(dir, ["add", "second", "--id", "second"], env, tmp);
      assert(add.code === 0, `add exit ${add.code}: ${add.err}`);
      const list = runLauncher(dir, ["list"], env, tmp);
      assert(list.code === 0 && /^second\s/m.test(list.out), `list: ${list.out}`);
      const again = runLauncher(dir, ["add", "second"], env, tmp);
      assert(again.code === 1 && again.err.trim().split("\n").length === 1, `a second add should be refused: ${again.err}`);
      const remove = runLauncher(dir, ["remove", "second"], env, tmp);
      assert(remove.code === 0, `remove exit ${remove.code}: ${remove.err}`);
      const empty = runLauncher(dir, ["list"], env, tmp);
      assert(empty.code === 0 && !empty.out.includes("second"), `list after remove: ${empty.out}`);
      const first = runLauncher(dir, ["add", sampleDir, "--id", "sample"], env, tmp);
      assert(first.code === 0, `add sample exit ${first.code}: ${first.err}`);
    });

    await step("a busy port is one line and exit 1", async () => {
      blocker = net.createServer();
      await new Promise((resolve, reject) => {
        blocker.once("error", reject);
        blocker.listen(fixedPort, "127.0.0.1", resolve);
      });
      const r = runLauncher(dir, ["--no-open", "--port", String(fixedPort)], env, tmp);
      const lines = `${r.out}${r.err}`.trim().split(/\r?\n/);
      assert(r.code === 1, `exit ${r.code}`);
      assert(lines.length === 1 && lines[0] === `Port ${fixedPort} is in use. Try --port <other>.`, `output: ${JSON.stringify(lines)}`);
      await new Promise((resolve) => blocker.close(resolve));
      blocker = undefined;
    });

    // Hold the default port so the launcher has to fall back. If something else already holds 4700 here, that does the same.
    defaultBlocker = net.createServer();
    const holding = await new Promise((resolve) => {
      defaultBlocker.once("error", () => resolve(false));
      defaultBlocker.listen(4700, "127.0.0.1", () => resolve(true));
    });
    let log = "";
    server = spawn(launcherFile(dir), ["--no-open"], { env, cwd: tmp, shell: isWin, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    const exited = new Promise((resolve) => server.once("exit", (code) => resolve(code)));
    const started = Date.now();
    let match = null;
    while (!match && Date.now() - started < 60_000 && server.exitCode === null) {
      match = /is running at http:\/\/127\.0\.0\.1:(\d+)/.exec(log);
      if (!match) await new Promise((r) => setTimeout(r, 200));
    }
    if (!match) throw new Error(`the launcher did not report a running server\n${log}`);
    port = Number(match[1]);
    base = `http://127.0.0.1:${port}`;
    await waitFor(`${base}/api/health`, 30_000);

    await step("the default port is 4700 and falls back to the next free one with a notice", () => {
      assert(port >= 4700 && port <= 4709, `port ${port} is outside 4700-4709`);
      if (holding) {
        assert(port === 4701, `4700 was held but the launcher chose ${port}`);
        assert(log.includes("Port 4700 is in use, using 4701."), `no fallback notice in: ${log}`);
      }
    });
    defaultBlocker.close();
    defaultBlocker = undefined;

    await step("the listener is 127.0.0.1 only", async () => {
      assert(await canConnect("127.0.0.1", port), "127.0.0.1 refused");
      for (const address of externalIPv4(os.networkInterfaces())) {
        assert(!(await canConnect(address, port)), `${address}:${port} accepted a connection`);
      }
    });

    await step("/ and a page answer 200 with the fixture's content", async () => {
      const home = await fetch(`${base}/`);
      assert(home.status === 200 && new URL(home.url).pathname.startsWith("/w/sample"), `/ -> ${home.status} ${home.url}`);
      const page = await fetch(`${base}/w/sample/index.md`);
      assert(page.status === 200 && (await page.text()).includes("Sample wiki"), `page ${page.status}`);
    });

    await step("the tab icons and the WR mark ship in the archive (US-289)", async () => {
      for (const [file, type] of [["/favicon.ico", "image/x-icon"], ["/icon.svg", "image/svg+xml"], ["/wr-mark.svg", "image/svg+xml"]]) {
        const res = await fetch(`${base}${file}`);
        const got = res.headers.get("content-type") ?? "";
        assert(res.status === 200 && got.startsWith(type), `${file} -> ${res.status} ${got}`);
        await res.arrayBuffer();
      }
    });

    await step("/settings shows the version footer and --version agrees", async () => {
      const res = await fetch(`${base}/settings`);
      const html = await res.text();
      assert(res.status === 200, `status ${res.status}`);
      const footer = /data-testid="settings-version"[^>]*>([^<]*)</.exec(html);
      assert(footer !== null && footer[1] === `Wiki Renderer ${installVersion}`, `footer: ${footer?.[1]}`);
    });

    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ baseURL: base });
      const outbound = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:" || url.hostname === "127.0.0.1") return route.continue();
        outbound.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();

      await step("search loads the index and finds a result", async () => {
        await page.goto("/w/sample/index.md");
        const index = page.waitForResponse((r) => r.url().includes("/api/wikis/sample/search-index/"));
        await page.getByTestId("search-trigger").click();
        assert((await index).status() === 200, "search index not 200");
        await page.getByRole("combobox").or(page.getByRole("searchbox")).or(page.locator("input").first()).first().fill("install");
        await page.getByTestId("search-result").first().waitFor({ timeout: 15_000 });
      });

      await step("a page save through the editor writes the temp copy", async () => {
        const file = path.join(sampleDir, "guides", "Getting started.md");
        const before = await readFile(file, "utf8");
        const marker = `smoke-${Date.now()}`;
        await page.goto("/w/sample/guides/Getting%20started.md?view=edit");
        await page.getByTestId("edit-save").and(page.locator(":enabled")).waitFor({ timeout: 30_000 });
        await page.locator('[contenteditable="true"]').first().click();
        await page.keyboard.type(marker);
        await page.getByTestId("edit-save").click();
        await page.getByTestId("edit-status").filter({ hasText: "Saved" }).waitFor({ timeout: 15_000 });
        const after = await readFile(file, "utf8");
        assert(after !== before && after.includes(marker), "the file on disk does not hold the typed text");
      });

      await step("zero requests left 127.0.0.1", () => {
        assert(outbound.length === 0, `outbound: ${outbound.join(", ")}`);
      });
    } finally {
      await browser.close();
    }

    await step("the server stops and frees the port", async () => {
      if (isWin) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
      else server.kill("SIGTERM");
      const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r("timeout"), 15_000))]);
      assert(code !== "timeout", "still running 15 s after the stop signal");
      if (!isWin) assert(code === 0, `exit ${code}`);
      assert(!(await canConnect("127.0.0.1", port)), "the port still answers");
      server = undefined;
    });
  } finally {
    blocker?.close();
    defaultBlocker?.close();
    if (server && server.exitCode === null) {
      if (isWin) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
      else server.kill("SIGKILL");
    }
    await rm(tmp, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
