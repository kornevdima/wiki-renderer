import path from "node:path";

/**
 * The wikis this instance serves, from `WIKI_DIRS`: comma-separated `id=folder` pairs, e.g.
 * `notes=../notes/wiki,engineering=~/code/engineering/wiki`. A bare folder (no `=`) takes its
 * id from the folder name, or from the parent's when the folder is called `wiki`. Relative folders resolve against the
 * process's working directory; a leading `~/` against `HOME`. Order is kept: the first wiki is the home redirect target
 * when it is the only one.
 */
export interface LocalWiki {
  id: string;
  name: string;
  root: string;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

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

function displayName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function resolveFolder(raw: string, cwd: string, home: string | undefined): string {
  if (raw === "~" || raw.startsWith("~/")) {
    if (!home) throw new WikiConfigError(`WIKI_DIRS: "${raw}" uses ~ but HOME is not set`);
    return path.resolve(home, raw.slice(2));
  }
  return path.resolve(cwd, raw);
}

export function parseWikiDirs(value: string, cwd: string, home?: string): LocalWiki[] {
  const wikis: LocalWiki[] = [];
  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    const rawFolder = eq === -1 ? part : part.slice(eq + 1).trim();
    if (rawFolder === "") throw new WikiConfigError(`WIKI_DIRS: "${part}" has no folder`);
    const root = resolveFolder(rawFolder, cwd, home);
    let id: string;
    if (eq === -1) {
      const base = path.basename(root);
      id = slug(base === "wiki" ? path.basename(path.dirname(root)) : base);
    } else {
      id = part.slice(0, eq).trim();
    }
    if (!ID.test(id)) throw new WikiConfigError(`WIKI_DIRS: id "${id}" must be lowercase letters, digits and dashes`);
    if (wikis.some((w) => w.id === id)) throw new WikiConfigError(`WIKI_DIRS: id "${id}" is listed twice`);
    wikis.push({ id, name: displayName(id), root });
  }
  if (wikis.length === 0) throw new WikiConfigError("WIKI_DIRS: no wiki folders configured");
  return wikis;
}
