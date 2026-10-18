import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The app's version (US-278): the `version` in the `package.json` next to the server. A release sets it from the tag
 * before the build, so `wiki-renderer --version` and the Settings footer read the same file. The server's working
 * directory is the install folder (`server.js` changes into it) or the repo root (`next dev`, `next start`).
 */
export const UNKNOWN_VERSION = "unknown";

/** Reads `version` from `<dir>/package.json`; `unknown` when the file or the field is missing or unusable. */
export function readVersion(dir: string): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const version = typeof parsed === "object" && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
    return typeof version === "string" && version.trim() !== "" ? version.trim() : UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

/** The running server's version. */
export function appVersion(): string {
  return readVersion(process.cwd());
}
