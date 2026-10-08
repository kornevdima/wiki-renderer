import { describe, expect, it } from "vitest";
import type { OutlineEntry } from "@/content/render/types";
import { groupOutline, OUTLINE_MIN, showsOutline } from "./outline-tree";

const e = (depth: 2 | 3, id: string): OutlineEntry => ({ depth, id, text: id });

describe("showsOutline (US-219)", () => {
  it("needs three or more entries, h2 and h3 together", () => {
    expect(OUTLINE_MIN).toBe(3);
    expect(showsOutline(undefined)).toBe(false);
    expect(showsOutline([])).toBe(false);
    expect(showsOutline([e(2, "a"), e(2, "b")])).toBe(false);
    expect(showsOutline([e(2, "a"), e(2, "b"), e(3, "c")])).toBe(true);
  });
});

describe("groupOutline", () => {
  it("nests each h3 under the preceding h2, keeping page order", () => {
    const groups = groupOutline([e(2, "a"), e(2, "b"), e(3, "b1"), e(3, "b2"), e(2, "c"), e(2, "d")]);
    expect(groups.map((g) => [g.entry.id, g.children.map((c) => c.id)])).toEqual([
      ["a", []],
      ["b", ["b1", "b2"]],
      ["c", []],
      ["d", []],
    ]);
  });
  it("makes every h3 before the first h2 top level (an h3 never holds another h3)", () => {
    const groups = groupOutline([e(3, "x"), e(3, "y"), e(2, "a"), e(3, "a1")]);
    expect(groups.map((g) => [g.entry.id, g.children.map((c) => c.id)])).toEqual([
      ["x", []],
      ["y", []],
      ["a", ["a1"]],
    ]);
  });
  it("is empty for an empty outline", () => {
    expect(groupOutline([])).toEqual([]);
  });
});
