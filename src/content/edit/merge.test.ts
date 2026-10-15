import { describe, expect, it } from "vitest";

import { lcsPairs, mergeEdit, mergeLine, splitBlocks, unescapeObsidian } from "./merge";

// The original as a person wrote it, and what the editor makes of it untouched (padded table, escaped wikilinks and callout).
const ORIGINAL = `---
title: Notes
---

# Notes

See [[Getting started|the guide]] and ![[diagram.png]].

* star bullet
* second

| A | B |
|---|---|
| 1 | 2 |
| 3 | 4 |

> [!note] Heads up
> Body.
`;

const BASELINE = `---
title: Notes
---

# Notes

See \\[\\[Getting started|the guide]] and !\\[\\[diagram.png]].

- star bullet
- second

| A | B |
| - | - |
| 1 | 2 |
| 3 | 4 |

> \\[!note] Heads up
> Body.
`;

describe("mergeEdit", () => {
  it("returns the original byte for byte when nothing was edited", () => {
    expect(mergeEdit(ORIGINAL, BASELINE, BASELINE)).toEqual({ text: ORIGINAL, preserved: true });
  });

  it("rewrites only the edited block and keeps every other block as written", () => {
    const edited = BASELINE.replace("# Notes", "# Field notes");
    expect(mergeEdit(ORIGINAL, BASELINE, edited).text).toBe(ORIGINAL.replace("# Notes", "# Field notes"));
  });

  it("keeps a table's other lines when one cell changes", () => {
    const edited = BASELINE.replace("| 3 | 4 |", "| 3 | 5 |");
    expect(mergeEdit(ORIGINAL, BASELINE, edited).text).toBe(ORIGINAL.replace("| 3 | 4 |", "| 3 | 5 |"));
  });

  it("keeps a list's other items when one item changes", () => {
    const edited = BASELINE.replace("- second", "- second, edited");
    expect(mergeEdit(ORIGINAL, BASELINE, edited).text).toBe(ORIGINAL.replace("* second", "- second, edited"));
  });

  it("writes wikilinks, embeds and callouts unescaped in an edited block", () => {
    const edited = BASELINE.replace("and !\\[\\[diagram.png]].", "and !\\[\\[diagram.png]], plus \\[\\[\\_run EPIC-005]].").replace("> Body.", "> Body, edited.");
    const { text } = mergeEdit(ORIGINAL, BASELINE, edited);
    expect(text).toContain("See [[Getting started|the guide]] and ![[diagram.png]], plus [[_run EPIC-005]].");
    expect(text).toContain("> [!note] Heads up\n> Body, edited.");
  });

  it("adds a new block with the editor's spacing and keeps its neighbours", () => {
    const edited = BASELINE.replace("# Notes\n", "# Notes\n\nA new paragraph.\n");
    expect(mergeEdit(ORIGINAL, BASELINE, edited).text).toBe(ORIGINAL.replace("# Notes\n", "# Notes\n\nA new paragraph.\n"));
  });

  it("drops a deleted block and keeps the original spacing of the blocks that stay neighbours", () => {
    const edited = BASELINE.replace("# Notes\n\n", "");
    expect(mergeEdit(ORIGINAL, BASELINE, edited).text).toBe(ORIGINAL.replace("# Notes\n\n", ""));
  });

  it("uses the editor's text whole, flagged, when the original can't be mapped block for block", () => {
    const result = mergeEdit("one\n\ntwo\n", "one two\n", "one two three\n");
    expect(result).toEqual({ text: "one two three\n", preserved: false });
  });

  it("always ends the file with a newline", () => {
    expect(mergeEdit("a\n", "a\n", "b").text).toBe("b\n");
  });
});

describe("unescapeObsidian", () => {
  it("unescapes wikilinks and embeds, keeping \\| for table cells", () => {
    expect(unescapeObsidian("\\[\\[a\\_b\\|c]] !\\[\\[img.png]]")).toBe("[[a_b\\|c]] ![[img.png]]");
  });

  it("unescapes a callout marker at the start of a quote line only", () => {
    expect(unescapeObsidian("> \\[!warning] Title\ntext \\[!x]")).toBe("> [!warning] Title\ntext \\[!x]");
    expect(unescapeObsidian("> > \\[!tip] Nested")).toBe("> > [!tip] Nested");
  });

  it("leaves escapes outside wikilinks alone", () => {
    expect(unescapeObsidian("a \\* b \\_c\\_")).toBe("a \\* b \\_c\\_");
  });
});

describe("splitBlocks and lcsPairs", () => {
  it("splits top-level blocks with their source offsets", () => {
    const blocks = splitBlocks("# A\n\ntext\n");
    expect(blocks.map((b) => b.text)).toEqual(["# A", "text"]);
  });

  it("pairs a longest common subsequence in order", () => {
    expect(lcsPairs(["a", "b", "c", "d"], ["a", "x", "c", "d"])).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("mergeEdit and HTML comments, which the editor drops", () => {
  const original = "# A\n\n<!-- keep me -->\n\n- one\n- two\n\nEnd.\n";
  const baseline = "# A\n\n- one\n- two\n\nEnd.\n";

  it("keeps a comment between two untouched blocks", () => {
    expect(mergeEdit(original, baseline, baseline.replace("End.", "The end.")).text).toBe(original.replace("End.", "The end."));
  });

  it("keeps a comment above a block that was edited", () => {
    expect(mergeEdit(original, baseline, baseline.replace("- two", "- three")).text).toBe(original.replace("- two", "- three"));
  });

  it("keeps a comment with the block after it when a new block is inserted before", () => {
    const edited = baseline.replace("# A\n", "# A\n\nNew.\n");
    expect(mergeEdit(original, baseline, edited).text).toBe("# A\n\nNew.\n\n<!-- keep me -->\n\n- one\n- two\n\nEnd.\n");
  });
});

describe("mergeLine: only the changed span comes from the editor", () => {
  it("keeps the original's characters around a typed insertion, without the serializer's escapes", () => {
    const original = "`main` = `feat` = `0b06` has work from today.";
    const baseline = "`main` \\= `feat` \\= `0b06` has work from today.";
    const edited = "`main` \\= `feat` \\= `0b06` has uncommitted work from today.";
    expect(mergeLine(original, baseline, edited)).toBe("`main` = `feat` = `0b06` has uncommitted work from today.");
  });

  it("keeps wikilinks as written around an edit", () => {
    const original = "See [[A_b]] and [[C]].";
    const baseline = "See \\[\\[A\\_b]] and \\[\\[C]].";
    const edited = "See \\[\\[A\\_b]] and also \\[\\[C]].";
    expect(mergeLine(original, baseline, edited)).toBe("See [[A_b]] and also [[C]].");
  });

  it("falls back to the unescaped editor line when the lines differ by more than escapes", () => {
    expect(mergeLine("* item", "- item", "- item two")).toBe("- item two");
  });

  it("merges an edited paragraph through mergeEdit", () => {
    const original = "# T\n\n`a` = `b` here.\n";
    const baseline = "# T\n\n`a` \\= `b` here.\n";
    expect(mergeEdit(original, baseline, baseline.replace("here.", "here now.")).text).toBe("# T\n\n`a` = `b` here now.\n");
  });
});
