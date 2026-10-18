import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkWikiId, WikiConfigError } from "./config";

/**
 * The user's config file (US-276): `config.json` in the platform's config folder, holding the wiki list and
 * `printFileTitle` only. This module is the one reader and the one writer of that file; the Settings page (US-277) and
 * the CLI (US-278) write through `writeUserConfig`. Branding and tuning stay environment variables.
 *
 * Shape: `{ "wikis": [{ "id", "name", "root" }], "printFileTitle": false }`. Unknown keys are ignored on read and
 * dropped on write. `root` is kept as written (`~/notes` stays `~/notes`) so the file moves between machines.
 */
export interface StoredWiki {
  id: string;
  name: string;
  root: string;
}

export interface UserConfig {
  wikis: StoredWiki[];
  printFileTitle: boolean;
}

export interface PathContext {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homedir: string;
}

/** Where the config file lives: `WIKI_RENDERER_CONFIG`, else `config.json` in the platform's config folder. */
export function configFilePath(ctx: PathContext = { platform: process.platform, env: process.env, homedir: os.homedir() }): string {
  const override = ctx.env.WIKI_RENDERER_CONFIG?.trim();
  if (override) return path.resolve(override);
  if (ctx.platform === "win32") {
    const appData = ctx.env.APPDATA?.trim() || path.win32.join(ctx.homedir, "AppData", "Roaming");
    return path.win32.join(appData, "wiki-renderer", "config.json");
  }
  if (ctx.platform === "darwin") return path.posix.join(ctx.homedir, "Library", "Application Support", "wiki-renderer", "config.json");
  const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
  return path.posix.join(xdg || path.posix.join(ctx.homedir, ".config"), "wiki-renderer", "config.json");
}

function fail(file: string, message: string): never {
  throw new WikiConfigError(`${file}: ${message}`);
}

/** Validates a parsed document into a `UserConfig`; throws `WikiConfigError` naming the file and the problem. */
export function parseUserConfig(value: unknown, file: string): UserConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(file, "expected a JSON object");
  const doc = value as Record<string, unknown>;
  const rawWikis = doc.wikis ?? [];
  if (!Array.isArray(rawWikis)) fail(file, '"wikis" must be a list');
  const wikis: StoredWiki[] = [];
  rawWikis.forEach((entry: unknown, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail(file, `wikis[${i}] must be an object`);
    const { id, name, root } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !checkWikiId(id)) {
      fail(file, `wikis[${i}] id ${JSON.stringify(id)} must be lowercase letters, digits and dashes`);
    }
    if (wikis.some((w) => w.id === id)) fail(file, `id "${id}" is listed twice`);
    if (typeof root !== "string" || root.trim() === "") fail(file, `wiki "${id}" has no root folder`);
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) fail(file, `wiki "${id}" has an empty name`);
    wikis.push({ id, name: typeof name === "string" ? name.trim() : displayNameOf(id), root: root.trim() });
  });
  if (doc.printFileTitle !== undefined && typeof doc.printFileTitle !== "boolean") fail(file, '"printFileTitle" must be true or false');
  return { wikis, printFileTitle: doc.printFileTitle === true };
}

function displayNameOf(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Reads the file synchronously (`listWikis` is sync). A missing file is the empty config; anything unreadable throws `WikiConfigError`. */
export function readUserConfigSync(file: string): UserConfig {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { wikis: [], printFileTitle: false };
    fail(file, `cannot be read (${(error as Error).message})`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    fail(file, `is not valid JSON (${(error as Error).message})`);
  }
  return parseUserConfig(json, file);
}

/** Async read for callers that are already async (the Settings page). Same rules as `readUserConfigSync`. */
export async function readUserConfig(file: string): Promise<UserConfig> {
  return readUserConfigSync(file);
}

/**
 * Writes the config atomically: a temp file in the same folder, then a rename over the target, so a reader never sees a
 * half-written file and a failed write leaves the old file intact. Validates first (throws `WikiConfigError`, writes
 * nothing) and creates the config folder when it is missing.
 */
export async function writeUserConfig(file: string, config: UserConfig): Promise<void> {
  const clean = parseUserConfig({ wikis: config.wikis, printFileTitle: config.printFileTitle }, file);
  const text = `${JSON.stringify(clean, null, 2)}\n`;
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, file);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}
