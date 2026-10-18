/**
 * The Host check for Settings actions (US-277, DNS rebinding). The app has no sign-in and binds to 127.0.0.1; a public
 * name that resolves to 127.0.0.1 would otherwise reach it from a web page. Next already refuses a cross-origin server
 * action, so this closes the same-origin-by-name gap: only `127.0.0.1:<port>` and `localhost:<port>` pass, where the
 * port is the one this server listens on (`next start` and `next dev` set `PORT`; 3000 when unset).
 */
export const DEFAULT_PORT = 3000;

/** The port this server listens on, read at call time from `PORT`. */
export function listeningPort(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** True only for `127.0.0.1:<port>` or `localhost:<port>` (case-insensitive name, exact port). A missing Host is refused. */
export function isLocalHost(host: string | null | undefined, port: number): boolean {
  if (typeof host !== "string") return false;
  const value = host.trim().toLowerCase();
  return value === `127.0.0.1:${port}` || value === `localhost:${port}`;
}
