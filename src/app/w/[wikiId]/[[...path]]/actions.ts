"use server";

import { z } from "zod";

import { mergeEdit } from "@/content/edit/merge";
import { findWiki, invalidateSnapshot } from "@/content/runtime";
import { relativeImageAddress } from "@/components/reader/edit-text";
import { isSavablePath, MAX_PAGE_BYTES, saveAsset, savePage, type AssetFailure, type SaveFailure } from "@/content/runtime/local-write";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

/**
 * Saves one page from the editor (`?view=edit`). The editor sends the Markdown it made of the page before any edit
 * (`baseline`) and now (`edited`), with the hash of the file it opened; `savePage` checks the path and the hash, and
 * `mergeEdit` keeps every untouched block as written. The app binds to 127.0.0.1 and Next checks a server action's origin.
 */
export type SavePageOutcome =
  | { ok: true; changed: boolean; hash: string; text: string; preserved: boolean }
  | { ok: false; reason: SaveFailure | "read_only" | "invalid" };

const input = z.object({
  wikiId: z.string().min(1).max(200),
  path: z.string().min(1).max(2000),
  baseHash: z.string().regex(/^[0-9a-f]{64}$/),
  baseline: z.string().max(MAX_PAGE_BYTES),
  edited: z.string().max(MAX_PAGE_BYTES),
});

export async function savePageAction(raw: z.input<typeof input>): Promise<SavePageOutcome> {
  if (env.WIKI_READ_ONLY) return { ok: false, reason: "read_only" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { wikiId, path, baseHash, baseline, edited } = parsed.data;
  const wiki = findWiki(wikiId);
  if (wiki === undefined) return { ok: false, reason: "not_found" };

  let preserved = true;
  const result = await savePage(wiki.root, path, baseHash, (current) => {
    const merged = mergeEdit(current, baseline, edited);
    preserved = merged.preserved;
    return merged.text;
  });
  const logger = log.child({ wikiId });
  if (!result.ok) {
    logger.warn("edit.save_refused", { path, reason: result.reason });
    return result;
  }
  if (result.changed) {
    invalidateSnapshot(wikiId);
    logger.info("edit.saved", { path, preserved });
  }
  return { ...result, preserved };
}

export type UploadImageOutcome = { ok: true; src: string } | { ok: false; reason: AssetFailure | "read_only" | "invalid" | "not_found" };

/**
 * Adds an image picked in the editor's image dialog to the wiki's `assets/` folder (`saveAsset`) and answers the address
 * to write into the page: relative to the page's folder (`../assets/diagram.png`).
 */
export async function uploadImageAction(form: FormData): Promise<UploadImageOutcome> {
  if (env.WIKI_READ_ONLY) return { ok: false, reason: "read_only" };
  const wikiId = form.get("wikiId");
  const path = form.get("path");
  const file = form.get("file");
  if (typeof wikiId !== "string" || typeof path !== "string" || !(file instanceof File) || !isSavablePath(path)) {
    return { ok: false, reason: "invalid" };
  }
  const wiki = findWiki(wikiId);
  if (wiki === undefined) return { ok: false, reason: "not_found" };
  const result = await saveAsset(wiki.root, file.name, new Uint8Array(await file.arrayBuffer()));
  const logger = log.child({ wikiId });
  if (!result.ok) {
    logger.warn("edit.upload_refused", { reason: result.reason });
    return result;
  }
  invalidateSnapshot(wikiId);
  logger.info("edit.uploaded", { path: result.path });
  return { ok: true, src: relativeImageAddress(path, result.path) };
}
