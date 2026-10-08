/**
 * Next's instrumentation hook: runs once per server instance at boot, before the server accepts requests. Validates
 * the environment and the `WIKI_DIRS` list eagerly, so a bad configuration fails at startup instead of on the first
 * request. Node.js runtime only. Both checks are dynamic imports so `zod`, `node:fs` and every `process.exit` stay off
 * the Edge bundle (`src/proxy.ts`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertValidEnvOrExit } = await import("@/lib/env");
  assertValidEnvOrExit();

  const { assertWikisOrExit } = await import("@/content/runtime");
  assertWikisOrExit();
}
