import path from "node:path";

import { cliCopy, translate } from "./copy";
import { displayName, checkWikiId, parseWikiDirs } from "@/content/runtime/config";
import { readUserConfig, writeUserConfig } from "@/content/runtime/user-config";
import { checkNewFolder } from "@/content/runtime/wiki-list-edit";
import { failureText } from "@/app/settings/failure-copy";
import { DEFAULT_MAX_BYTES } from "@/lib/settings-limits";

/**
 * `add`, `remove` and `list` (US-278). They change the same config file as the Settings page, through the same
 * `checkNewFolder` and `writeUserConfig`. There is no Host check: this is the person's own process. A refusal prints the
 * Settings sentence, writes nothing and returns 1.
 */
export interface CommandContext {
  configPath: string;
  env: Record<string, string | undefined>;
  /** Where the person typed the command: a relative folder starts here. */
  cwd: string;
  /** What a relative `WIKI_DIRS` entry resolves against (the server's working directory, the install folder). */
  serverCwd: string;
  home?: string;
  out: (line: string) => void;
  err: (line: string) => void;
}

/** `WIKI_MAX_BYTES` as the server reads it: a positive whole number, else the 50 MiB default. */
export function maxBytesFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.WIKI_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_BYTES;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function wikiDirsSet(env: Record<string, string | undefined>): boolean {
  return (env.WIKI_DIRS?.trim() ?? "") !== "";
}

/** A relative folder starts from the shell's folder; `~` and absolute paths stay as typed (the file keeps `~`). */
export function absoluteFolder(raw: string, cwd: string): string {
  const typed = raw.trim();
  if (typed === "" || typed === "~" || typed.startsWith("~/") || typed.startsWith("~\\") || path.isAbsolute(typed)) return typed;
  return path.resolve(cwd, typed);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function managedRefusal(ctx: CommandContext): number {
  ctx.err(translate("errors.managed_by_env"));
  return 1;
}

export async function runAdd(ctx: CommandContext, folder: string, id?: string): Promise<number> {
  if (wikiDirsSet(ctx.env)) return managedRefusal(ctx);
  if (id !== undefined && !checkWikiId(id)) {
    ctx.err(cliCopy.idInvalid(id));
    return 1;
  }
  try {
    const config = await readUserConfig(ctx.configPath);
    const check = await checkNewFolder(absoluteFolder(folder, ctx.cwd), {
      existing: config.wikis,
      configDir: path.dirname(ctx.configPath),
      maxBytes: maxBytesFromEnv(ctx.env),
      ...(ctx.home === undefined ? {} : { home: ctx.home }),
    });
    if (!check.ok) {
      ctx.err(failureText(translate, check));
      return 1;
    }
    let wiki = check.wiki;
    if (id !== undefined) {
      if (config.wikis.some((w) => w.id === id)) {
        ctx.err(cliCopy.idTaken(id));
        return 1;
      }
      wiki = { ...wiki, id, name: displayName(id) };
    }
    await writeUserConfig(ctx.configPath, { ...config, wikis: [...config.wikis, wiki] });
    ctx.out(cliCopy.added(wiki.id, wiki.root));
    return 0;
  } catch (error) {
    ctx.err(failureText(translate, { reason: "config_error", message: message(error) }));
    return 1;
  }
}

export async function runRemove(ctx: CommandContext, id: string): Promise<number> {
  if (wikiDirsSet(ctx.env)) return managedRefusal(ctx);
  try {
    const config = await readUserConfig(ctx.configPath);
    if (!config.wikis.some((w) => w.id === id)) {
      ctx.err(cliCopy.notListed(id));
      return 1;
    }
    await writeUserConfig(ctx.configPath, { ...config, wikis: config.wikis.filter((w) => w.id !== id) });
    ctx.out(cliCopy.removed(id));
    return 0;
  } catch (error) {
    ctx.err(failureText(translate, { reason: "config_error", message: message(error) }));
    return 1;
  }
}

export async function runList(ctx: CommandContext): Promise<number> {
  try {
    const managed = wikiDirsSet(ctx.env);
    const wikis = managed
      ? parseWikiDirs(ctx.env.WIKI_DIRS ?? "", ctx.serverCwd, ctx.home)
      : (await readUserConfig(ctx.configPath)).wikis;
    if (managed) ctx.out(cliCopy.managed);
    if (wikis.length === 0) {
      ctx.out(cliCopy.empty);
      return 0;
    }
    const idWidth = Math.max(...wikis.map((w) => w.id.length));
    const nameWidth = Math.max(...wikis.map((w) => w.name.length));
    for (const w of wikis) ctx.out(`${w.id.padEnd(idWidth)}  ${w.name.padEnd(nameWidth)}  ${w.root}`);
    return 0;
  } catch (error) {
    ctx.err(message(error));
    return 1;
  }
}
