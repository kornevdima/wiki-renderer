import { describe, expect, it } from "vitest";

import { buildFrontmatterView } from "@/content/render/frontmatter-view";

import { buildPageMeta, metaStatus, parseMetaDate } from "./page-meta-model";

/** The model is fed exactly what the render pipeline hands the reader: `frontmatterView`, wikilinks resolved. */
const meta = (frontmatter: Record<string, unknown>) => buildPageMeta(buildFrontmatterView(frontmatter, () => "/w/x/p.md"));

describe("status badge (US-220; TC-512)", () => {
  it.each([
    ["accepted", "Accepted", "success"],
    ["done", "Done", "success"],
    ["approved", "Approved", "success"],
    ["draft", "Draft", "neutral"],
    ["proposed", "Proposed", "neutral"],
    ["delivered", "Delivered", "neutral"],
    ["withdrawn", "Withdrawn", "neutral"],
  ])("%s reads %s in the %s style", (status, word, variant) => {
    expect(metaStatus(status)).toEqual({ word, variant });
  });

  it("trims and ignores case for the success words, and keeps the author's letters after the first", () => {
    expect(metaStatus("ACCEPTED ")).toEqual({ word: "ACCEPTED", variant: "success" });
    expect(metaStatus("  Done")).toEqual({ word: "Done", variant: "success" });
    expect(metaStatus("won't fix")).toEqual({ word: "Won't fix", variant: "neutral" });
  });

  it("a value that is not a plain string gives no badge and no throw", () => {
    const values: unknown[] = [["accepted", "draft"], 1, true, null, "", "   ", { a: "b" }, undefined];
    for (const value of values) expect(metaStatus(value), JSON.stringify(value)).toBeNull();
  });

  it("a wikilink status is a LinkedText in the view, so it gives no badge", () => {
    expect(meta({ status: "[[Some page]]" })).toBeNull();
    expect(meta({ status: "[[Some page]]", tags: ["a"] })?.status).toBeNull();
  });

  it("hostile and long strings are kept as text for the component to escape, and only success or neutral is ever produced", () => {
    expect(metaStatus("<b>done</b>")).toEqual({ word: "<b>done</b>", variant: "neutral" });
    expect(metaStatus("x".repeat(300))?.word).toHaveLength(300);
    expect(metaStatus("line one\nline two")?.variant).toBe("neutral");
    for (const value of ["warning", "danger", "error", "blocked", "failed"]) expect(metaStatus(value)?.variant).toBe("neutral");
  });
});

describe("dates (US-220; TC-513; FR-051)", () => {
  const iso = (value: unknown) => parseMetaDate(value)?.toISOString() ?? null;

  it("reads YYYY-MM-DD and ISO date-times, in UTC", () => {
    expect(iso("2026-10-07")).toBe("2026-10-07T00:00:00.000Z");
    expect(iso("2026-10-07T10:00:00Z")).toBe("2026-10-07T10:00:00.000Z");
    expect(iso("2026-10-07 10:00")).toBe("2026-10-07T10:00:00.000Z");
    expect(iso("2026-10-07T10:00:00.123456")).toBe("2026-10-07T10:00:00.000Z");
  });

  it("applies the offset, so 23:30 at -05:00 is the next UTC day", () => {
    expect(iso("2026-10-07T23:30:00-05:00")).toBe("2026-10-08T04:30:00.000Z");
    expect(meta({ updated: "2026-10-07T23:30:00-05:00" })?.date?.iso).toBe("2026-10-08");
    expect(iso("2026-10-07T00:30:00+02:00")).toBe("2026-10-06T22:30:00.000Z");
  });

  it("leaves out every unusable value, and never throws", () => {
    const values: unknown[] = ["2026-02-30", "2026-13-01", "2026-00-10", "0000-01-01", "99999-01-01", "7 Oct 2026", 20261007, "", "  ", ["2026-10-07"], null, undefined, "2026-10-07T24:00:00Z", "2026-10-07T10:60:00Z", "2026-10-07T10:00:00+24:00", " 2026-10-07", "2026-10-07x", {}];
    for (const value of values) expect(parseMetaDate(value), JSON.stringify(value)).toBeNull();
    expect(parseMetaDate("2028-02-29")).not.toBeNull();
    expect(parseMetaDate("2027-02-29")).toBeNull();
  });

  it("shows Updated, falls back to Created, and shows neither when both are unusable", () => {
    expect(meta({ updated: "2026-10-07", created: "2026-09-12" })?.date).toMatchObject({ kind: "updated", iso: "2026-10-07" });
    expect(meta({ created: "2026-09-12" })?.date).toMatchObject({ kind: "created", iso: "2026-09-12" });
    expect(meta({ updated: "2026-02-30", created: "2026-09-12" })?.date).toMatchObject({ kind: "created", iso: "2026-09-12" });
    expect(meta({ updated: 20261007, created: "tomorrow", tags: ["a"] })?.date).toBeNull();
    expect(meta({ updated: "2026-02-30", created: null })).toBeNull();
  });

  it("an unusable date does not remove the raw value from the view the disclosure lists", () => {
    const view = buildFrontmatterView({ updated: "2026-02-30" });
    expect(view).toEqual([{ key: "updated", value: "2026-02-30" }]);
  });
});

describe("the whole model (US-220)", () => {
  it("is null with none of status, updated, created or tags, and with no frontmatter", () => {
    expect(meta({ title: "T", owner: "x" })).toBeNull();
    expect(meta({})).toBeNull();
    expect(buildPageMeta(undefined)).toBeNull();
    expect(buildPageMeta([])).toBeNull();
  });

  it("leaves out a missing part and keeps the others", () => {
    expect(meta({ tags: ["a"] })).toMatchObject({ status: null, date: null, tags: { chips: ["a"] } });
    expect(meta({ status: "draft" })).toMatchObject({ status: { word: "Draft" }, date: null, tags: null });
  });

  it("builds from the view only: a field the view cut or a nested value is not read", () => {
    expect(meta({ status: { nested: "accepted" } })).toBeNull();
  });
});

describe("tags in the meta line (TC-514)", () => {
  it("the line holds exactly the chips All properties would draw (the shared tagChips rule)", () => {
    expect(meta({ tags: ["adr", "reader"] })?.tags).toEqual({ chips: ["adr", "reader"], truncated: false });
    expect(meta({ tags: ["Adr", "adr", "adr"] })?.tags?.chips).toEqual(["Adr", "adr", "adr"]);
  });

  it("500 tags are bounded by the view at 100, with the truncation marker", () => {
    const tags = Array.from({ length: 500 }, (_, i) => `t${i}`);
    const out = meta({ tags })?.tags;
    expect(out?.chips).toHaveLength(100);
    expect(out?.truncated).toBe(true);
  });

  it("a string, a mixed list, a map and a wikilink tag give no chips, so the line shows no tags", () => {
    for (const tags of ["adr, reader", [1, true, null, "", "  ", { a: "b" }, ["x"]], { a: "b" }, ["[[Page]]"]]) {
      expect(meta({ tags, status: "draft" })?.tags, JSON.stringify(tags)).toBeNull();
    }
  });

  it("markup in a tag stays text", () => {
    expect(meta({ tags: ["<script>alert(1)</script>", "a&b", '"q"'] })?.tags?.chips).toEqual(["<script>alert(1)</script>", "a&b", '"q"']);
  });
});
