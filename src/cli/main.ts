import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args";
import { runAdd, runList, runRemove, type CommandContext } from "./commands";
import { helpText } from "./help";
import { createLineFilter } from "./output-filter";
import { openBrowser } from "./open-browser";
import { resolvePortPlan } from "./port-plan";
import { runStart, waitForServer } from "./start";
import { DEFAULT_API_BASE, isUpdateCheckEnabled, runUpdateCheck, updateCachePath } from "./update-check";
import { configFilePath, readUserConfig } from "@/content/runtime/user-config";
import { readVersion } from "@/lib/version";

/** The CLI entry (`cli.mjs`, bundled by `vite.cli.config.mts`). `cli.mjs` sits in the install folder beside `server.js` and `package.json`. */
async function main(argv: string[]): Promise<number> {
  const installDir = path.dirname(fileURLToPath(import.meta.url));
  const version = readVersion(installDir);
  const out = (line: string) => process.stdout.write(`${line}\n`);
  const err = (line: string) => process.stderr.write(`${line}\n`);

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    err(parsed.message);
    err("Run wiki-renderer --help for usage.");
    return 2;
  }
  const { command } = parsed;

  if (command.kind === "help") {
    out(helpText(version).trimEnd());
    return 0;
  }
  if (command.kind === "version") {
    out(version);
    return 0;
  }

  const ctx: CommandContext = {
    configPath: configFilePath(),
    env: process.env,
    cwd: process.cwd(),
    serverCwd: installDir,
    home: os.homedir(),
    out,
    err,
  };
  switch (command.kind) {
    case "add":
      return runAdd(ctx, command.folder, command.id);
    case "remove":
      return runRemove(ctx, command.id);
    case "list":
      return runList(ctx);
    case "start": {
      // A config file that cannot be read is the server's to report (the home page names it); the port then falls back to the default.
      const configPort = await readUserConfig(ctx.configPath).then(
        (config) => config.port,
        () => undefined,
      );
      const chosen = resolvePortPlan({ flag: command.port, env: process.env, configPort });
      if (!chosen.ok) {
        err(chosen.message);
        return 2;
      }
      return runStart({ plan: chosen.plan, open: command.open, verbose: command.verbose }, {
        installDir,
        nodePath: process.execPath,
        version,
        env: process.env,
        out,
        err,
        spawnServer: (cmd, args, options) => {
          if (!options.quiet) return spawn(cmd, args, { cwd: options.cwd, env: options.env as NodeJS.ProcessEnv, stdio: "inherit" });
          // Quiet: stdout goes through the line filter, stderr straight through.
          const child = spawn(cmd, args, { cwd: options.cwd, env: options.env as NodeJS.ProcessEnv, stdio: ["inherit", "pipe", "inherit"] });
          const filter = createLineFilter((line) => process.stdout.write(`${line}\n`));
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => filter.push(chunk));
          child.stdout.on("end", () => filter.flush());
          return child;
        },
        waitReady: (url) => waitForServer(url),
        onReady: () => {
          // Off by default: with the check off this does nothing and no request is made.
          void runUpdateCheck({
            enabled: isUpdateCheckEnabled(process.env, command.checkUpdates),
            current: version,
            platform: process.platform,
            cachePath: updateCachePath(ctx.configPath),
            apiBase: process.env.WIKI_RENDERER_API_BASE?.trim() || DEFAULT_API_BASE,
            out,
          });
        },
        openUrl: (url) => {
          openBrowser(url, process.platform, spawn);
        },
        onStop: (stop) => {
          for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, stop);
        },
      });
    }
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
