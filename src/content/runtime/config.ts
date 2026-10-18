import os from "node:os";
import path from "node:path";

/**
 * The wikis this instance serves, from `WIKI_DIRS`: comma-separated `id=folder` pairs, e.g.
 * `notes=../notes/wiki,engineering=~/code/engineering/wiki`. A bare folder (no `=`) takes its
 * id from the folder name, or from the parent's when the folder is called `wiki`. Relative folders resolve against the
 * process's working directory; a leading `~/` against `os.homedir()` (so it works on Windows too). Order is kept: the first wiki is the home redirect target
 * when it is the only one.
 */
export interface LocalWiki {
  id: string;
  name: string;
  root: string;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

/** The wiki id rule: lowercase letters, digits and dashes, starting with a letter or digit. */
export function checkWikiId(id: string): boolean {
  return ID.test(id);
}

export class WikiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiConfigError";
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The display name derived from an id (`esg-project` becomes "Esg Project"); the file reader and Settings use the same rule. */
export function displayName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Resolves a folder as written: `~` / `~/x` against the home folder (`os.homedir()`), else against `cwd`. Also `BRAND_LOGO`'s rule. */
export function resolveFolder(raw: string, cwd: string, home: string = os.homedir()): string {
  if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) return path.resolve(home, raw.slice(2));
  return path.resolve(cwd, raw);
}

/** The id a bare folder gets: its name, or its parent's name when the folder is called `wiki`. Empty when the name has no letters or digits. */
export function idFromFolder(root: string): string {
  const base = path.basename(root);
  return slug(base === "wiki" ? path.basename(path.dirname(root)) : base);
}

export function parseWikiDirs(value: string, cwd: string, home: string = os.homedir()): LocalWiki[] {
  const wikis: LocalWiki[] = [];
  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    const rawFolder = eq === -1 ? part : part.slice(eq + 1).trim();
    if (rawFolder === "") throw new WikiConfigError(`WIKI_DIRS: "${part}" has no folder`);
    const root = resolveFolder(rawFolder, cwd, home);
    let id: string;
    if (eq === -1) {
      id = idFromFolder(root);
    } else {
      id = part.slice(0, eq).trim();
    }
    if (!checkWikiId(id)) throw new WikiConfigError(`WIKI_DIRS: id "${id}" must be lowercase letters, digits and dashes`);
    if (wikis.some((w) => w.id === id)) throw new WikiConfigError(`WIKI_DIRS: id "${id}" is listed twice`);
    wikis.push({ id, name: displayName(id), root });
  }
  if (wikis.length === 0) throw new WikiConfigError("WIKI_DIRS: no wiki folders configured");
  return wikis;
}
