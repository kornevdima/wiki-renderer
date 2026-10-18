import { parsePort } from "./args";
import { APP_PORT_FALLBACKS, DEFAULT_APP_PORT } from "@/lib/settings-limits";

/**
 * Which port to listen on (US-278). A port the person chose never moves; only the default does.
 * Precedence: `--port`, then `WIKI_RENDERER_PORT`, then the config file's `port`, then the default with a next-free fallback.
 */
export type PortPlan =
  | { kind: "fixed"; port: number; source: "--port" | "WIKI_RENDERER_PORT" | "config" }
  | { kind: "range"; first: number; last: number };

export function resolvePortPlan(input: {
  flag: number | null;
  env: Record<string, string | undefined>;
  configPort?: number | undefined;
}): { ok: true; plan: PortPlan } | { ok: false; message: string } {
  if (input.flag !== null) return { ok: true, plan: { kind: "fixed", port: input.flag, source: "--port" } };
  const raw = input.env.WIKI_RENDERER_PORT?.trim();
  if (raw) {
    const port = parsePort(raw);
    if (port === null) return { ok: false, message: "WIKI_RENDERER_PORT needs a number from 1 to 65535." };
    return { ok: true, plan: { kind: "fixed", port, source: "WIKI_RENDERER_PORT" } };
  }
  if (input.configPort !== undefined) return { ok: true, plan: { kind: "fixed", port: input.configPort, source: "config" } };
  return { ok: true, plan: { kind: "range", first: DEFAULT_APP_PORT, last: DEFAULT_APP_PORT + APP_PORT_FALLBACKS } };
}

/** The ports to try, in order. */
export function candidatePorts(plan: PortPlan): number[] {
  if (plan.kind === "fixed") return [plan.port];
  return Array.from({ length: plan.last - plan.first + 1 }, (_, i) => plan.first + i);
}
