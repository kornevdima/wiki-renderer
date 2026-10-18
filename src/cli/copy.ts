import messages from "../../messages/en.json";

import type { Translate } from "@/app/settings/failure-copy";

/** The Settings page's refusal sentences (`settings.errors.*`), reused word for word by the CLI. */
export const translate: Translate = (key, values) => {
  let node: unknown = messages.settings;
  for (const part of key.split(".")) {
    node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  const text = typeof node === "string" ? node : key;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (values && name in values ? String(values[name]) : whole));
};

/** CLI-only lines (the Settings page has no equivalent). */
export const cliCopy = {
  added: (id: string, folder: string) => `Added ${id}: ${folder}`,
  removed: (id: string) => `Removed ${id}. The folder on disk is not touched.`,
  empty: "No wikis yet. Add one with: wiki-renderer add <folder>",
  managed: "WIKI_DIRS is set, so it decides the list and the config file is ignored.",
  idInvalid: (id: string) => `"${id}" is not a valid id. Use lowercase letters, digits and dashes.`,
  idTaken: (id: string) => `A wiki with the id "${id}" is already listed.`,
  notListed: (id: string) => `No wiki with the id "${id}" is listed.`,
  running: (version: string, url: string) => `Wiki Renderer ${version} is running at ${url}. Press Ctrl+C to stop.`,
  fellBack: (first: number, using: number) => `Port ${first} is in use, using ${using}.`,
  allBusy: (first: number, last: number) => `Ports ${first} to ${last} are all in use. Try --port <other>.`,
  bindFailed: (port: number) => `Could not start on port ${port}. Is it in use? Try --port <other>.`,
  serverMissing: "Could not find the app server next to the launcher. Unpack the archive again.",
} as const;
