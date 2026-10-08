import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ContentSource, WikiFileTree } from "./source";

/**
 * Reads a wiki from a folder on disk. Only tool folders are skipped, at every depth: `.git`, `node_modules`, and
 * Obsidian's own `.obsidian` and `.trash`. Every other folder, dot folders included, is content, as in a GitHub tarball
 * (DEC-006: nothing is hidden by name). `.DS_Store` files are skipped too.
 *
 * The "sha" is a fingerprint of every kept file's path, size and mtime, so an edit, add, delete or rename gives a new id
 * and the next request rebuilds; it is cheap (stat only, no reads).
 *
 * `maxBytes` caps the total size read into memory; a larger folder fails the build with `WikiTooLargeError`.
 */
export class WikiTooLargeError extends Error {
  constructor(readonly totalBytes: number, readonly maxBytes: number) {
    super(`wiki is ${totalBytes} bytes, over the ${maxBytes}-byte limit`);
    this.name = "WikiTooLargeError";
  }
}

interface Entry {
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

const SKIPPED = new Set([".git", "node_modules", ".obsidian", ".trash", ".DS_Store"]);

function skipped(name: string): boolean {
  return SKIPPED.has(name);
}

async function walk(root: string): Promise<Entry[]> {
  const out: Entry[] = [];
  async function visit(dir: string): Promise<void> {
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      if (skipped(d.name)) continue;
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) {
        await visit(abs);
      } else if (d.isFile() || d.isSymbolicLink()) {
        const s = await stat(abs).catch(() => null);
        if (s === null || !s.isFile()) continue;
        out.push({ rel: path.relative(root, abs).split(path.sep).join("/"), abs, size: s.size, mtimeMs: s.mtimeMs });
      }
    }
  }
  await visit(root);
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

function fingerprint(entries: readonly Entry[]): string {
  const hash = createHash("sha1");
  for (const e of entries) hash.update(`${e.rel}\0${e.size}\0${e.mtimeMs}\n`);
  return hash.digest("hex");
}

export function createLocalSource(root: string, maxBytes: number): ContentSource {
  return {
    async getLatestSha() {
      return fingerprint(await walk(root));
    },
    async fetchTree(sha): Promise<WikiFileTree> {
      const entries = await walk(root);
      const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
      if (totalBytes > maxBytes) throw new WikiTooLargeError(totalBytes, maxBytes);
      const files = new Map<string, Uint8Array>();
      for (const e of entries) files.set(e.rel, new Uint8Array(await readFile(e.abs)));
      // A file changed between the two walks: label the tree with what was actually read.
      const actual = fingerprint(entries);
      return { sha: actual === sha ? sha : actual, files, totalBytes };
    },
  };
}
