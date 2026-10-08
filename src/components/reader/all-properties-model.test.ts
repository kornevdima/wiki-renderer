import { describe, expect, it } from "vitest";

import { buildFrontmatterView } from "@/content/render/frontmatter-view";

import { propertyRows } from "./all-properties-model";

const rowsFor = (frontmatter: Record<string, unknown>) => propertyRows(buildFrontmatterView(frontmatter));

describe("the All properties count (US-220; TC-515)", () => {
  it("twelve plain keys count twelve", () => {
    const fm = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
    const out = rowsFor(fm);
    expect(out.count).toBe(12);
    expect(out.rows).toHaveLength(12);
    expect(out.truncated).toBe(false);
  });

  it("a nested map or list counts once, and an empty or null value still counts", () => {
    expect(rowsFor({ map: { a: 1, b: 2, c: 3, d: 4 }, list: Array.from({ length: 10 }, (_, i) => i), nothing: null }).count).toBe(3);
    expect(rowsFor({ s: "", l: [], m: {} }).count).toBe(3);
  });

  it("every key is a row, produced_by and effort_estimate included: nothing is filtered by name", () => {
    const keys = ["produced_by", "effort_estimate", "decided_by", "traces_to", "tenant", "internal", "private"];
    const out = rowsFor(Object.fromEntries(keys.map((k) => [k, "x"])));
    expect(out.rows.map((r) => r.key)).toEqual(keys);
    expect(out.count).toBe(keys.length);
  });

  it("a key list cut at the view's bound counts the rows listed (100), never the sentinel, and flags the mark", () => {
    const out = rowsFor(Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i])));
    expect(out.count).toBe(100);
    expect(out.rows).toHaveLength(100);
    expect(out.rows.at(-1)?.key).toBe("k99");
    expect(out.truncated).toBe(true);
  });

  it("exactly 100 keys is not truncated", () => {
    const out = rowsFor(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i])));
    expect(out).toMatchObject({ count: 100, truncated: false });
  });

  it("a real key spelled (truncated) among few keys is a row, not the sentinel", () => {
    const out = propertyRows([{ key: "(truncated)", value: "(truncated)" }]);
    expect(out).toMatchObject({ count: 1, truncated: false });
  });

  it("a long value keeps its own (truncated) text and does not change the count", () => {
    const out = rowsFor({ long: "z".repeat(2500), b: 1 });
    expect(out.count).toBe(2);
    expect(out.truncated).toBe(false);
  });

  it("duplicate keys are one row (the parser resolved them, last wins)", () => {
    expect(rowsFor(JSON.parse('{"a":1,"a":2}') as Record<string, unknown>).count).toBe(1);
  });

  it("an empty list of fields is zero rows", () => {
    expect(propertyRows([])).toEqual({ rows: [], count: 0, truncated: false });
  });
});
