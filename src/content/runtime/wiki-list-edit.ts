import { realpath, stat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { checkWikiId, displayName, idFromFolder, resolveFolder } from "./config";
import { measureFolder } from "./local-source";
import { isLocalHost } from "@/lib/host-check";
import { MAX_APP_PORT, MAX_FOLDER_LENGTH, MAX_NAME_LENGTH, MIN_APP_PORT } from "@/lib/settings-limits";
import { readUserConfig, writeUserConfig, type StoredWiki, type UserConfig } from "./user-config";

/**
 * What the Settings page changes (US-277): add, rename, move, remove a wiki and the print setting. `applyChange` is the
 * whole action, minus the Next wiring (`app/settings/actions.ts`): it checks the Host, refuses when `WIKI_DIRS` manages
 * the list, validates the input, RE-READS the file (so a change made on disk since the page loaded is kept), changes
 * it and writes through `writeUserConfig`. A refusal writes nothing. It never touches a wiki folder.
 */

const idField = z.string().min(1).max(200);
export const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), folder: z.string().max(MAX_FOLDER_LENGTH) }),
  z.object({ kind: z.literal("rename"), id: idField, name: z.string().max(MAX_FOLDER_LENGTH) }),
  z.object({ kind: z.literal("move"), id: idField, direction: z.enum(["up", "down"]) }),
  z.object({ kind: z.literal("remove"), id: idField }),
  z.object({ kind: z.literal("printFileTitle"), value: z.boolean() }),
  // The launcher's port (US-278); null clears it (the default with a next-free fallback).
  z.object({ kind: z.literal("port"), value: z.number().int().min(MIN_APP_PORT).max(MAX_APP_PORT).nullable() }),
]);
export type Change = z.infer<typeof changeSchema>;

export type AddFailure = "empty" | "not_absolute" | "not_found" | "not_a_folder" | "unreadable" | "already_listed" | "too_large";
export type ChangeFailure = AddFailure | "forbidden_host" | "managed_by_env" | "config_error" | "invalid" | "port_invalid" | "not_listed" | "name_empty" | "name_too_long";

export type ChangeOutcome =
  | { ok: true; wiki?: StoredWiki }
  | { ok: false; reason: ChangeFailure; message?: string; bytes?: number; limit?: number };

export interface ChangeContext {
  /** The request's Host header (null when missing). */
  host: string | null;
  /** The port this server listens on. */
  port: number;
  configPath: string;
  managedByEnv: boolean;
  maxBytes: number;
  home?: string;
}

/** `base`, else `base-2`, `base-3`, … the first not in `taken`. An empty base is "wiki". */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const root = base === "" ? "wiki" : base;
  if (!taken.has(root)) return root;
  for (let n = 2; ; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export type AddCheck = { ok: true; wiki: StoredWiki } | { ok: false; reason: AddFailure; bytes?: number; limit?: number };

async function realOrResolved(p: string): Promise<string> {
  return realpath(p).catch(() => p);
}

/**
 * Checks a typed folder path for adding. Order: not found, not a folder, cannot be read, already listed (the same real
 * path), over `maxBytes`. Id and name are derived as `WIKI_DIRS` derives them; an id already in use gets `-2`, `-3`, …
 * `root` is kept as typed (trimmed), so `~/notes` stays `~/notes` in the file.
 */
export async function checkNewFolder(
  raw: string,
  opts: { existing: readonly StoredWiki[]; configDir: string; maxBytes: number; home?: string; skipSize?: boolean },
): Promise<AddCheck> {
  const typed = raw.trim();
  if (typed === "") return { ok: false, reason: "empty" };
  const home = opts.home ?? os.homedir();
  const isHome = typed === "~" || typed.startsWith("~/") || typed.startsWith("~\\");
  if (!isHome && !path.isAbsolute(typed)) return { ok: false, reason: "not_absolute" };
  const resolved = resolveFolder(typed, opts.configDir, home);

  let info;
  try {
    info = await stat(resolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, reason: code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "unreadable" };
  }
  if (!info.isDirectory()) return { ok: false, reason: "not_a_folder" };
  try {
    await readdir(resolved);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const real = await realOrResolved(resolved);
  for (const wiki of opts.existing) {
    const other = await realOrResolved(resolveFolder(wiki.root, opts.configDir, home));
    if (other === real) return { ok: false, reason: "already_listed" };
  }

  if (opts.skipSize !== true) {
    // Stops once the total passes the limit, so `bytes` is a lower bound ("at least") when the folder is too large.
    let measured: { bytes: number; over: boolean };
    try {
      measured = await measureFolder(resolved, opts.maxBytes);
    } catch {
      return { ok: false, reason: "unreadable" };
    }
    if (measured.over) return { ok: false, reason: "too_large", bytes: measured.bytes, limit: opts.maxBytes };
  }

  const id = uniqueId(idFromFolder(resolved), new Set(opts.existing.map((w) => w.id)));
  if (!checkWikiId(id)) return { ok: false, reason: "invalid" as AddFailure };
  return { ok: true, wiki: { id, name: displayName(id), root: typed } };
}

/** Pure list edits; each returns a new config, or null when nothing changes. */
export function renamed(config: UserConfig, id: string, name: string): UserConfig | null {
  const wikis = config.wikis.map((w) => (w.id === id ? { ...w, name } : w));
  return wikis.some((w, i) => w.name !== config.wikis[i]!.name) ? { ...config, wikis } : null;
}

export function moved(config: UserConfig, id: string, direction: "up" | "down"): UserConfig | null {
  const from = config.wikis.findIndex((w) => w.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= config.wikis.length) return null;
  const wikis = [...config.wikis];
  [wikis[from], wikis[to]] = [wikis[to]!, wikis[from]!];
  return { ...config, wikis };
}

export function removed(config: UserConfig, id: string): UserConfig {
  return { ...config, wikis: config.wikis.filter((w) => w.id !== id) };
}

export async function applyChange(input: unknown, ctx: ChangeContext): Promise<ChangeOutcome> {
  if (!isLocalHost(ctx.host, ctx.port)) return { ok: false, reason: "forbidden_host" };
  // `WIKI_DIRS` manages the wiki list, not the port: the port is the one change that stays open then.
  const isPort = typeof input === "object" && input !== null && (input as { kind?: unknown }).kind === "port";
  if (ctx.managedByEnv && !isPort) return { ok: false, reason: "managed_by_env" };
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: isPort ? "port_invalid" : "invalid" };
  const change = parsed.data;

  let name = "";
  if (change.kind === "rename") {
    name = change.name.trim();
    if (name === "") return { ok: false, reason: "name_empty" };
    if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: "name_too_long" };
  }

  // Fresh read: the file may have changed since the page loaded. A bad file is never overwritten.
  let config: UserConfig;
  try {
    config = await readUserConfig(ctx.configPath);
  } catch (error) {
    return { ok: false, reason: "config_error", message: error instanceof Error ? error.message : String(error) };
  }

  let next: UserConfig | null;
  let wiki: StoredWiki | undefined;
  switch (change.kind) {
    case "add": {
      const check = await checkNewFolder(change.folder, {
        existing: config.wikis,
        configDir: path.dirname(ctx.configPath),
        maxBytes: ctx.maxBytes,
        ...(ctx.home === undefined ? {} : { home: ctx.home }),
      });
      if (!check.ok) return check;
      // The check can take a while (it measures the folder). Re-read the file now, just before the write, and re-run the
      // list-dependent checks (already listed, id collision) against it, so a change made meanwhile is kept.
      let fresh: UserConfig;
      try {
        fresh = await readUserConfig(ctx.configPath);
      } catch (error) {
        return { ok: false, reason: "config_error", message: error instanceof Error ? error.message : String(error) };
      }
      const again = await checkNewFolder(change.folder, {
        existing: fresh.wikis,
        configDir: path.dirname(ctx.configPath),
        maxBytes: ctx.maxBytes,
        skipSize: true,
        ...(ctx.home === undefined ? {} : { home: ctx.home }),
      });
      if (!again.ok) return again;
      wiki = again.wiki;
      next = { ...fresh, wikis: [...fresh.wikis, again.wiki] };
      break;
    }
    case "rename":
      if (!config.wikis.some((w) => w.id === change.id)) return { ok: false, reason: "not_listed" };
      next = renamed(config, change.id, name);
      break;
    case "move":
      if (!config.wikis.some((w) => w.id === change.id)) return { ok: false, reason: "not_listed" };
      next = moved(config, change.id, change.direction);
      break;
    case "remove":
      if (!config.wikis.some((w) => w.id === change.id)) return { ok: false, reason: "not_listed" };
      next = removed(config, change.id);
      break;
    case "port": {
      const { port: _old, ...rest } = config;
      void _old;
      const updated: UserConfig = change.value === null ? rest : { ...rest, port: change.value };
      next = config.port === (change.value ?? undefined) ? null : updated;
      break;
    }
    case "printFileTitle":
      next = config.printFileTitle === change.value ? null : { ...config, printFileTitle: change.value };
      break;
  }
  if (next !== null) await writeUserConfig(ctx.configPath, next);
  return wiki ? { ok: true, wiki } : { ok: true };
}
