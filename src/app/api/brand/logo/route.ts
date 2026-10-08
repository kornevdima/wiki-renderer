import { readFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * `GET /api/brand/logo`: the `BRAND_LOGO` file, when one is configured (`src/lib/branding.ts`). Relative paths resolve
 * from the working directory and `~/` from HOME, like `WIKI_DIRS`. An SVG is sandboxed as the asset route does.
 */
export async function GET(): Promise<Response> {
  const configured = env.BRAND_LOGO;
  if (configured === undefined) return new Response(null, { status: 404 });
  const file =
    configured.startsWith("~/") && process.env.HOME ? path.join(process.env.HOME, configured.slice(2)) : path.resolve(configured);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (type === undefined) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(file);
    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "private, max-age=300" };
    if (type === "image/svg+xml") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
    return new Response(new Uint8Array(bytes), { headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
