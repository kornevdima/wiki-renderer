import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * The only module that writes into a wiki folder (DEC-016 note 2026-10-16). It saves one existing Markdown page:
 *
 * - the path is relative, POSIX, ends in `.md`, has no `..`, and no segment is a skipped tool folder (`.git`,
 *   `node_modules`, `.obsidian`, `.trash`), so a save can't reach what the reader never shows;
 * - the file must already exist, and its real path (symlinks resolved) must stay inside the wiki's real root;
 * - the file on disk must still hash to `baseHash`, the hash of what the editor opened, else it's a conflict and nothing is
 *   written (an edit in Obsidian or a `git pull` in the meantime is never overwritten);
 * - `compute` turns the current text into the new text (the block-preserving merge); an unchanged result writes nothing;
 * - the write goes to a temporary file beside the page, then a rename, with the page's mode kept.
 *
 * It also adds one uploaded image (`saveAsset`) to the wiki's `assets/` folder at the root (operator, 2026-10-16: "One assets/
 * folder"): an allowed image type by extension, at most `MAX_ASSET_BYTES`, a safe file name, never over an existing file
 * (a taken name gets `-1`, `-2`, …).
 *
 * Line endings and a byte-order mark are the file's own: the text is handed to `compute` with LF line endings and no
 * BOM, and both are put back on write.
 */
export type SaveFailure = "invalid_path" | "not_found" | "outside_wiki" | "conflict" | "too_large";

export type SaveResult =
  | { ok: true; changed: boolean; hash: string; text: string }
  | { ok: false; reason: SaveFailure };

/** The largest page a save writes. */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;

const SKIPPED_SEGMENTS = new Set([".git", "node_modules", ".obsidian", ".trash"]);
const BOM = "﻿";

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function isSavablePath(rel: string): boolean {
  if (rel === "" || rel.startsWith("/") || rel.includes("\\") || rel.includes("\0") || !rel.endsWith(".md")) return false;
  const segments = rel.split("/");
  return segments.every((s) => s !== "" && s !== "." && s !== ".." && !SKIPPED_SEGMENTS.has(s));
}

function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function savePage(
  root: string,
  rel: string,
  baseHash: string,
  compute: (current: string) => string,
): Promise<SaveResult> {
  if (!isSavablePath(rel)) return { ok: false, reason: "invalid_path" };
  const abs = path.join(root, ...rel.split("/"));
  let realRoot: string;
  let realFile: string;
  try {
    realRoot = await realpath(root);
    realFile = await realpath(abs);
  } catch {
    return { ok: false, reason: "not_found" };
  }
  if (!inside(realRoot, realFile)) return { ok: false, reason: "outside_wiki" };
  const info = await stat(realFile).catch(() => null);
  if (info === null || !info.isFile()) return { ok: false, reason: "not_found" };

  const raw = await readFile(realFile, "utf8");
  if (hashText(raw) !== baseHash) return { ok: false, reason: "conflict" };
  const bom = raw.startsWith(BOM);
  const crlf = raw.includes("\r\n");
  const current = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");

  const next = compute(current);
  if (next === current) return { ok: true, changed: false, hash: baseHash, text: raw };
  const out = (bom ? BOM : "") + (crlf ? next.replace(/\n/g, "\r\n") : next);
  if (Buffer.byteLength(out, "utf8") > MAX_PAGE_BYTES) return { ok: false, reason: "too_large" };

  const tmp = path.join(path.dirname(realFile), `.${path.basename(realFile)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, out, { encoding: "utf8", mode: info.mode & 0o777 });
    await rename(tmp, realFile);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
  return { ok: true, changed: true, hash: hashText(out), text: out };
}

/** The folder uploads go to, at the wiki root. */
export const ASSET_FOLDER = "assets";
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export type AssetFailure = "invalid_type" | "too_large" | "empty";
export type AssetResult = { ok: true; path: string } | { ok: false; reason: AssetFailure };

/** A file name that is safe on every platform and in a Markdown link: letters, digits, `-`, `_` and `.`; lower-case extension. */
export function safeAssetName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) return null;
  const stem = base
    .slice(0, dot)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${stem || "image"}.${ext}`;
}

export async function saveAsset(root: string, name: string, bytes: Uint8Array): Promise<AssetResult> {
  const safe = safeAssetName(name);
  if (safe === null) return { ok: false, reason: "invalid_type" };
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > MAX_ASSET_BYTES) return { ok: false, reason: "too_large" };
  const realRoot = await realpath(root);
  const folder = path.join(realRoot, ASSET_FOLDER);
  await mkdir(folder, { recursive: true });
  if (!inside(realRoot, await realpath(folder))) throw new Error("assets folder leads out of the wiki");
  const dot = safe.lastIndexOf(".");
  for (let n = 0; n < 1000; n++) {
    const candidate = n === 0 ? safe : `${safe.slice(0, dot)}-${n}${safe.slice(dot)}`;
    try {
      // `wx`: fails if the name is taken, so two uploads never overwrite each other or an existing file.
      await writeFile(path.join(folder, candidate), bytes, { flag: "wx" });
      return { ok: true, path: `${ASSET_FOLDER}/${candidate}` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("no free asset name");
}
