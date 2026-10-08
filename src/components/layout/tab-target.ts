export function pickTabTarget<T>(tabbables: readonly T[], trigger: T, backwards: boolean): T | null {
  const at = tabbables.indexOf(trigger);
  if (at < 0) return null;
  return tabbables[backwards ? at - 1 : at + 1] ?? null;
}

export const TABBABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
