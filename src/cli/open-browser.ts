import type { SpawnOptions } from "node:child_process";

/** The command that opens `url` in the default browser on `platform`. */
export function openerCommand(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => { on(event: "error", listener: () => void): unknown; unref(): void };

/** Opens `url`; never throws. Returns false when the opener could not be started (the caller has already printed the address). */
export function openBrowser(url: string, platform: NodeJS.Platform, spawn: SpawnFn): boolean {
  const { command, args } = openerCommand(platform, url);
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
