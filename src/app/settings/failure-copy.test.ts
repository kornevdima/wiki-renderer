import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { failureText, type Translate } from "./failure-copy";

// A tiny translator over the real messages, so a missing key fails here.
const t: Translate = (key, values = {}) => {
  const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en.settings);
  if (typeof raw !== "string") throw new Error(`missing settings.${key}`);
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
};

describe("failureText", () => {
  it("has a message for every refusal reason", () => {
    for (const reason of ["empty", "not_absolute", "not_found", "not_a_folder", "unreadable", "already_listed", "name_empty", "not_listed", "forbidden_host", "managed_by_env", "invalid"] as const) {
      expect(failureText(t, { reason })).not.toBe("");
    }
  });
  it("gives the size and the limit in human units", () => {
    expect(failureText(t, { reason: "too_large", bytes: 80 * 1024 * 1024, limit: 50 * 1024 * 1024 })).toBe("This folder is at least 80 MiB, over the 50 MiB limit.");
  });
  it("names the file problem and the name limit", () => {
    expect(failureText(t, { reason: "config_error", message: "boom" })).toContain("boom");
    expect(failureText(t, { reason: "name_too_long" })).toContain("100");
  });
});
