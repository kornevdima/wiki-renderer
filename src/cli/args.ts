/** The command line of `wiki-renderer` (US-278): pure parsing, no I/O. */

import { DEFAULT_APP_PORT } from "@/lib/settings-limits";

/** The default port (US-278, operator 2026-10-18): 4700, with the next free one up to 4709 when it is taken. */
export const DEFAULT_PORT = DEFAULT_APP_PORT;

export type Command =
  | { kind: "start"; port: number | null; open: boolean; verbose: boolean }
  | { kind: "add"; folder: string; id?: string }
  | { kind: "remove"; id: string }
  | { kind: "list" }
  | { kind: "version" }
  | { kind: "help" };

export type ParseResult = { ok: true; command: Command } | { ok: false; message: string };

const COMMANDS = new Set(["start", "add", "remove", "list"]);

function bad(message: string): ParseResult {
  return { ok: false, message };
}

/** A port is a whole number from 1 to 65535. */
export function parsePort(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

/**
 * `argv` is the arguments after the program name. `--help` / `-h` and `--version` / `-v` win over everything else. With no
 * command the app starts. A usage mistake answers `{ ok: false }` with the one line to print (exit code 2).
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  if (argv.includes("--help") || argv.includes("-h")) return { ok: true, command: { kind: "help" } };
  if (argv.includes("--version") || argv.includes("-v")) return { ok: true, command: { kind: "version" } };

  const positional: string[] = [];
  let port: number | null = null;
  let open = true;
  let verbose = false;
  let id: string | undefined;
  let sawStartFlag = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--no-open") {
      open = false;
      sawStartFlag = true;
    } else if (arg === "--verbose") {
      verbose = true;
      sawStartFlag = true;
    } else if (arg === "--port" || arg.startsWith("--port=")) {
      const value = arg === "--port" ? argv[(i += 1)] : arg.slice("--port=".length);
      const parsed = value === undefined ? null : parsePort(value);
      if (parsed === null) return bad("--port needs a number from 1 to 65535.");
      port = parsed;
      sawStartFlag = true;
    } else if (arg === "--id" || arg.startsWith("--id=")) {
      const value = arg === "--id" ? argv[(i += 1)] : arg.slice("--id=".length);
      if (value === undefined || value === "") return bad("--id needs a value.");
      id = value;
    } else if (arg.startsWith("-") && arg !== "-") {
      return bad(`Unknown option ${arg}.`);
    } else {
      positional.push(arg);
    }
  }

  const name = positional[0] ?? "start";
  if (!COMMANDS.has(name)) return bad(`Unknown command ${name}.`);
  const rest = positional.slice(1);

  switch (name) {
    case "start":
      if (rest.length > 0) return bad(`start takes no arguments, got ${rest[0]}.`);
      if (id !== undefined) return bad("--id belongs to add.");
      return { ok: true, command: { kind: "start", port, open, verbose } };
    case "add":
      if (sawStartFlag) return bad("--port, --no-open and --verbose belong to start.");
      if (rest.length !== 1) return bad("add needs one folder: wiki-renderer add <folder> [--id <id>].");
      return { ok: true, command: id === undefined ? { kind: "add", folder: rest[0]! } : { kind: "add", folder: rest[0]!, id } };
    case "remove":
      if (sawStartFlag || id !== undefined) return bad("remove takes only an id.");
      if (rest.length !== 1) return bad("remove needs one id: wiki-renderer remove <id>.");
      return { ok: true, command: { kind: "remove", id: rest[0]! } };
    default:
      if (sawStartFlag || id !== undefined || rest.length > 0) return bad("list takes no arguments.");
      return { ok: true, command: { kind: "list" } };
  }
}
