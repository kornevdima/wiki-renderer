import { MAX_APP_PORT, MIN_APP_PORT } from "./settings-limits";

/** The Port field's text as a value: `null` for empty (the default), the number for a whole number in range, `undefined` for anything else. */
export function parsePortField(text: string): number | null | undefined {
  const typed = text.trim();
  if (typed === "") return null;
  if (!/^\d{1,5}$/.test(typed)) return undefined;
  const port = Number(typed);
  return port >= MIN_APP_PORT && port <= MAX_APP_PORT ? port : undefined;
}
