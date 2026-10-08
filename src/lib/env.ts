import "server-only";

import { z } from "zod";

/** An optional var where an empty or whitespace-only value means "not configured". */
const blankAsUnset = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

/**
 * Zod-validated environment schema. Only `WIKI_DIRS` is required: every other variable has a code default.
 * `.env.local.example` documents each one.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Content ─────────────────────────────────────────────────────────────
  // Comma-separated `id=folder` pairs, or bare folders (`content/runtime/config.ts`).
  WIKI_DIRS: z.string().trim().min(1, "WIKI_DIRS must name at least one wiki folder"),
  // How often a request re-fingerprints a wiki folder; within the window the cached snapshot is served as is.
  WIKI_RECHECK_MS: z.coerce.number().int().nonnegative().default(1000),
  // Total bytes one wiki may load into memory.
  WIKI_MAX_BYTES: z.coerce.number().int().positive().default(209715200), // 200 MB
  // How long a folder must have been unreadable before the reader shows the staleness notice.
  WIKI_SNAPSHOT_STALE_NOTICE_MS: z.coerce.number().int().nonnegative().default(0),

  // ── Branding (optional; `src/lib/branding.ts`) ─────────────────────────
  BRAND_NAME: z.string().trim().min(1).default("Wiki Renderer"),
  BRAND_PRODUCT: z.string().trim().min(1).default("Wikis"),
  // One to three characters for the avatar; derived from BRAND_NAME when unset.
  BRAND_INITIALS: blankAsUnset.pipe(z.string().trim().min(1).max(3).optional()),
  // A logo image file (png, jpg, svg, webp) shown in place of the initials avatar.
  BRAND_LOGO: blankAsUnset,
  // The tab-title suffix ("<page> · <wiki> · <suffix>"); BRAND_NAME when unset.
  BRAND_TITLE: blankAsUnset,

  // ── Runtime / observability (optional) ──────────────────────────────────
  // pino level names, lowercase. No code default here: the logger picks its own default when this is unset.
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  PORT: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof schema>;

/**
 * One issue from a failed parse: the dotted variable path and zod's message.
 * Deliberately excludes the raw (possibly secret) value.
 */
export interface EnvIssue {
  path: string;
  message: string;
}

/**
 * Thrown when `process.env` fails the schema. `.issues` carries variable
 * names and zod's messages only — never the raw values. The name of this class is
 * itself the "named validation error" AC 2 asks for.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Eagerly validates the whole schema once, throwing `EnvValidationError` on
 * failure. Called only from `src/instrumentation.ts` `register()` (Node.js
 * runtime, at server startup) so an invalid environment fails closed before
 * the server accepts any traffic (AC 2), instead of surfacing lazily on
 * whichever request happens to touch `env` first.
 */
export function assertValidEnv(): void {
  load();
}

/**
 * Lazy proxy: validates on first property access, never at module load. This
 * is what keeps `next build` from needing runtime env (the Dockerfile build
 * stage has none) — nothing above this line runs eagerly just by importing
 * this module.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return load()[prop as keyof Env];
  },
});

/**
 * `src/instrumentation.ts` `register()`'s failure path (AC 2), kept in this
 * module (rather than inline in instrumentation.ts) so the only Node-only
 * API references (`process.exit`, `console.error`) sit behind the same
 * dynamic `import("@/lib/env")` that guards the rest of this module from the
 * Edge Runtime bundle — Turbopack's build-time "Node.js API used" warning
 * flags any static reference to `process.exit`, even one that's dead code at
 * runtime behind a `NEXT_RUNTIME` check, unless it's off the initial chunk
 * entirely.
 */
export function assertValidEnvOrExit(): void {
  try {
    assertValidEnv();
  } catch (error) {
    // Deliberately `console.error` + `JSON.stringify`, not `@/lib/log`
    // (US-013): this module must report an invalid environment even when
    // the environment is *so* invalid the app can't safely stand up
    // anything else, and `log.ts` must work without `env` (it reads
    // `LOG_LEVEL` straight off `process.env`) — importing `@/lib/log` here
    // would make this file depend on that module loading cleanly too,
    // for no benefit, so the two stay decoupled in both directions.
    //
    // Names and zod messages only — never the raw env values.
    if (error instanceof EnvValidationError) {
      console.error(
        JSON.stringify({
          severity: "ERROR",
          message: "startup.env_invalid",
          error_name: error.name,
          issues: error.issues,
        }),
      );
    } else {
      console.error(
        JSON.stringify({
          severity: "ERROR",
          message: "startup.env_invalid",
          error_name: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }

    // Exits explicitly (measured for this story, see instrumentation.ts):
    // AC 2 requires the process to never start in a degraded state, and a
    // bare throw out of `register()` isn't a guaranteed non-zero exit for
    // every entry point (Next's standalone `node server.js` included).
    process.exit(1);
  }
}
