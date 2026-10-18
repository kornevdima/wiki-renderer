"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getWikiList, invalidateWikiList } from "@/content/runtime";
import { applyChange, type Change, type ChangeOutcome } from "@/content/runtime/wiki-list-edit";
import { env } from "@/lib/env";
import { isLocalHost, listeningPort } from "@/lib/host-check";
import { log } from "@/lib/log";

/**
 * The Settings page's one server action (US-277). Every change goes through `applyChange`: Host check first (DNS
 * rebinding), then the `WIKI_DIRS` refusal, validation, a fresh read of the file and an atomic write. After a write the
 * wiki list is re-read at once and the home and Settings pages are revalidated. Next also checks the action's Origin.
 */
export type SettingsOutcome = ChangeOutcome;

export async function changeSettingsAction(raw: Change): Promise<SettingsOutcome> {
  const outcome = await (async (): Promise<SettingsOutcome> => {
    // The Host check comes first, before anything else is read.
    const host = (await headers()).get("host");
    const port = listeningPort();
    if (!isLocalHost(host, port)) return { ok: false, reason: "forbidden_host" };
    const list = getWikiList();
    return applyChange(raw, { host, port, configPath: list.configPath, managedByEnv: list.managedByEnv, maxBytes: env.WIKI_MAX_BYTES });
  })().catch((error: unknown): SettingsOutcome => {
    log.error("settings.write_failed", { error });
    return { ok: false, reason: "config_error", message: error instanceof Error ? error.message : String(error) };
  });
  if (outcome.ok) {
    invalidateWikiList();
    revalidatePath("/");
    revalidatePath("/settings");
  } else {
    log.warn("settings.refused", { reason: outcome.reason });
  }
  return outcome;
}
