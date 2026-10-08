import { describe, expect, it } from "vitest";

import { buildFrontmatterView } from "@/content/render/frontmatter-view";

import { tagChips } from "./frontmatter-tags";

describe("tagChips (US-188, FR-023)", () => {
  it("maps a list of scalars to chip texts in order", () => {
    expect(tagChips("tags", ["adr", "architecture", 2026, true])).toEqual({ chips: ["adr", "architecture", "2026", "true"], truncated: false });
  });
  it("only the tags key; other keys keep the list rendering", () => {
    expect(tagChips("aliases", ["a"])).toBeNull();
    expect(tagChips("Tags", ["a"])).toBeNull();
  });
  it("falls back for a non-list, an empty list, a nested value or an empty item", () => {
    expect(tagChips("tags", "a, b")).toBeNull();
    expect(tagChips("tags", [])).toBeNull();
    expect(tagChips("tags", null)).toBeNull();
    expect(tagChips("tags", [["x"]])).toBeNull();
    expect(tagChips("tags", [{ a: 1 }])).toBeNull();
    expect(tagChips("tags", ["a", ""])).toBeNull();
    expect(tagChips("tags", ["a", null])).toBeNull();
  });
  it("falls back when an item holds a wikilink", () => {
    const [field] = buildFrontmatterView({ tags: ["[[Page]]"] }, () => "/w/x/p.md");
    expect(tagChips("tags", field!.value)).toBeNull();
  });
  it("keeps a trailing (truncated) marker out of the chips and flags it", () => {
    expect(tagChips("tags", ["a", "b", "(truncated)"])).toEqual({ chips: ["a", "b"], truncated: true });
  });
  it("a lone or non-trailing (truncated) item is an ordinary chip", () => {
    expect(tagChips("tags", ["(truncated)"])).toEqual({ chips: ["(truncated)"], truncated: false });
    expect(tagChips("tags", ["(truncated)", "a"])).toEqual({ chips: ["(truncated)", "a"], truncated: false });
  });
  it("a view-bounded long list ends in the marker, not a chip", () => {
    const tags = Array.from({ length: 150 }, (_, i) => `t${i}`);
    const [field] = buildFrontmatterView({ tags }, () => "/w/x/p.md");
    const out = tagChips("tags", field!.value);
    expect(out?.truncated).toBe(true);
    expect(out?.chips).toHaveLength(100);
    expect(out?.chips).not.toContain("(truncated)");
  });
  it("hostile text is returned as plain strings for React to escape", () => {
    expect(tagChips("tags", ["<img src=x onerror=1>"])).toEqual({ chips: ["<img src=x onerror=1>"], truncated: false });
  });
});
