// The release workflow's installer step (US-279): serves one just-built archive, a one-file SHA256SUMS and a fake
// releases/latest from a local server, runs the installer for this OS into a temporary WIKI_RENDERER_HOME, then runs
// <home>/bin/wiki-renderer --version and checks it prints the version. Nothing leaves the machine.
//   node scripts/install-check.mjs <archive> --version <v>
// The platform comes from the archive's name. install.sh runs through `sh`, install.ps1 through `powershell -File`.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveReleases } from "./lib/release-server.mjs";

const TEST_PATH_VALUE = "WikiRendererTestPath";
const SEED_PATH = "%USERPROFILE%\\fake-dir;C:\\keep";

/** Runs a snippet against HKCU:\\Environment as $k (Windows PowerShell); returns its output. */
function registry(snippet, writable) {
  const script = `$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $${writable ? "true" : "false"}); ${snippet}; $k.Close()`;
  const ran = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8" });
  if (ran.status !== 0) throw new Error(`registry step failed: ${ran.stderr}`);
  return ran.stdout;
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function installCheck({ archive, version }) {
  const name = path.basename(archive);
  const platform = new RegExp(`^wiki-renderer-${version.replace(/[.]/g, "\\.")}-(darwin|linux|win)-(arm64|x64)\\.(tar\\.gz|zip)$`).exec(name);
  if (!platform) throw new Error(`${name} is not a wiki-renderer-${version}-<platform>-<arch> archive`);
  const windows = platform[1] === "win";
  const bytes = await readFile(archive);
  const sums = `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`;
  const server = await serveReleases({ latest: version, releases: { [version]: { [name]: bytes, SHA256SUMS: sums } } });
  const temp = await mkdtemp(path.join(os.tmpdir(), "wr-install-check-"));
  try {
    const home = path.join(temp, "home");
    const env = {
      ...process.env,
      HOME: path.join(temp, "user"),
      USERPROFILE: path.join(temp, "user"),
      WIKI_RENDERER_HOME: home,
      WIKI_RENDERER_API_BASE: server.apiBase,
      WIKI_RENDERER_DOWNLOAD_BASE: server.downloadBase,
    };
    delete env.WIKI_RENDERER_VERSION;
    // Windows: the installer extends a throwaway user-environment value instead of the real Path, seeded with an unexpanded
    // %USERPROFILE% entry. The same code path runs; the runner's real Path is never read or written. Removed in `finally`.
    if (windows) env.WIKI_RENDERER_PATH_VALUE_NAME = TEST_PATH_VALUE;
    if (windows) registry(`$k.SetValue('${TEST_PATH_VALUE}', '${SEED_PATH}', [Microsoft.Win32.RegistryValueKind]::ExpandString)`, true);
    // Asynchronous: the local server lives in this process, so a blocking spawn would deadlock the download.
    const run = await new Promise((resolve) => {
      const [command, args] = windows
        ? ["powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "install.ps1")]]
        : ["sh", [path.join(root, "install.sh")]];
      const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (error) => resolve({ status: -1, stdout, stderr: `${stderr}${error.message}` }));
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    process.stdout.write(run.stdout);
    process.stderr.write(run.stderr);
    if (run.status !== 0) throw new Error(`the installer exited with ${run.status}`);
    const shim = path.join(home, "bin", windows ? "wiki-renderer.cmd" : "wiki-renderer");
    const ran = windows
      ? spawnSync(`"${shim}" --version`, { env, encoding: "utf8", shell: true })
      : spawnSync(shim, ["--version"], { env, encoding: "utf8" });
    const printed = (ran.stdout ?? "").trim();
    if (ran.status !== 0 || printed !== version) {
      throw new Error(`${shim} --version printed "${printed}" (exit ${ran.status}), expected "${version}"\n${ran.stderr ?? ""}`);
    }
    // A usage mistake must come back as exit code 2 through the shim (on Windows, through the .cmd without `call`).
    const bogus = windows
      ? spawnSync(`"${shim}" --bogus`, { env, encoding: "utf8", shell: true })
      : spawnSync(shim, ["--bogus"], { env, encoding: "utf8" });
    if (bogus.status !== 2) throw new Error(`${shim} --bogus exited ${bogus.status}, expected 2: the exit code did not pass through the shim\n${bogus.stderr ?? ""}`);
    if (windows) {
      const [raw, kind] = registry(`$k.GetValue('${TEST_PATH_VALUE}', '', 'DoNotExpandEnvironmentNames'); $k.GetValueKind('${TEST_PATH_VALUE}')`, false).trim().split(/\r?\n/);
      const bin = path.join(home, "bin");
      if (raw !== `${SEED_PATH};${bin}` || kind !== "ExpandString") {
        throw new Error(`the user PATH value is "${raw}" (${kind}), expected "${SEED_PATH};${bin}" as ExpandString: an unexpanded entry was lost`);
      }
      console.log(`user PATH kept ${SEED_PATH} unexpanded and added ${bin}`);
    }
    console.log(`install check passed: ${shim} --version printed ${printed}`);
  } finally {
    if (windows) {
      try {
        registry(`$k.DeleteValue('${TEST_PATH_VALUE}', $false)`, true);
      } catch {
        // Nothing to remove.
      }
    }
    await server.close();
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const versionAt = args.indexOf("--version");
  const archive = args.find((arg, i) => i !== versionAt && i !== versionAt + 1);
  if (!archive || versionAt < 0 || !args[versionAt + 1]) {
    console.error("Usage: node scripts/install-check.mjs <archive> --version <v>");
    process.exit(2);
  }
  installCheck({ archive: path.resolve(archive), version: args[versionAt + 1] }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
