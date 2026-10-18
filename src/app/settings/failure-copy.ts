import { formatBytes } from "@/lib/format-bytes";
import type { ChangeFailure } from "@/content/runtime/wiki-list-edit";
import { MAX_NAME_LENGTH } from "@/lib/settings-limits";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The sentence for a refused change: the `settings.errors.<reason>` message, with the size and limit or file problem filled in. */
export function failureText(
  t: Translate,
  failure: { reason: ChangeFailure; message?: string; bytes?: number; limit?: number },
): string {
  switch (failure.reason) {
    case "too_large":
      return t("errors.too_large", { size: formatBytes(failure.bytes ?? 0), limit: formatBytes(failure.limit ?? 0) });
    case "config_error":
      return t("errors.config_error", { message: failure.message ?? "" });
    case "name_too_long":
      return t("errors.name_too_long", { max: MAX_NAME_LENGTH });
    default:
      return t(`errors.${failure.reason}`);
  }
}
