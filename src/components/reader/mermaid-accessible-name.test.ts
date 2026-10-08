/**
 * US-192 (FR-027, TC-504): the accessible name of a drawn diagram. Pure attribute handling over a hand-written element fake (the
 * repo has no jsdom); the real svg Mermaid 12.0.0 emits, and the accessibility tree, are read by the e2e walk.
 */
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { authorTitleOf, nameDrawnDiagram, type SvgElementLike } from "./mermaid-accessible-name";

class FakeTitle {
  constructor(
    private readonly attrs: Record<string, string>,
    readonly textContent: string | null,
  ) {}
  getAttribute(n: string) {
    return this.attrs[n] ?? null;
  }
}

class FakeSvg implements SvgElementLike {
  attrs = new Map<string, string>();
  constructor(
    attrs: Record<string, string>,
    private readonly titles: FakeTitle[] = [],
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  getAttribute(n: string) {
    return this.attrs.get(n) ?? null;
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  removeAttribute(n: string) {
    this.attrs.delete(n);
  }
  querySelectorAll(selector: string) {
    return selector === "title" ? this.titles : [];
  }
}

/** What Mermaid 12.0.0 measured: a graphics document with a roledescription, no name. */
const bare = () => new FakeSvg({ role: "graphics-document document", "aria-roledescription": "flowchart-v2" });
/** With `accTitle` (and `accDescr`): the title is a child, named by aria-labelledby. */
const titled = (text: string | null = "Release flow") =>
  new FakeSvg(
    {
      role: "graphics-document document",
      "aria-roledescription": "sequence",
      "aria-labelledby": "chart-title-m-1",
      "aria-describedby": "chart-desc-m-1",
    },
    [new FakeTitle({ id: "chart-title-m-1" }, text)],
  );

describe("copy", () => {
  it("the generic name is the accepted word, in the mermaid namespace", () => {
    expect(messages.mermaid.diagramName).toBe("Diagram");
  });
});

describe("authorTitleOf", () => {
  it("reads the title the svg's aria-labelledby names", () => {
    expect(authorTitleOf(titled())).toBe("Release flow");
  });

  it("collapses whitespace in the author's title", () => {
    expect(authorTitleOf(titled("  Release \n  flow  "))).toBe("Release flow");
  });

  it("has none when the svg is not labelled, the title is empty, or the labelledby names another element", () => {
    expect(authorTitleOf(bare())).toBeUndefined();
    expect(authorTitleOf(titled("   "))).toBeUndefined();
    expect(authorTitleOf(titled(null))).toBeUndefined();
    const other = new FakeSvg({ "aria-labelledby": "elsewhere" }, [new FakeTitle({ id: "chart-title-m-1" }, "Not it")]);
    expect(authorTitleOf(other)).toBeUndefined();
  });
});

describe("nameDrawnDiagram", () => {
  it("names a diagram with no author title by the generic name, as an image", () => {
    const svg = bare();
    expect(nameDrawnDiagram(svg, "Diagram")).toBe("Diagram");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Diagram");
  });

  it("names a diagram by the author's accTitle, not the generic name", () => {
    const svg = titled();
    expect(nameDrawnDiagram(svg, "Diagram")).toBe("Release flow");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Release flow");
  });

  it("leaves exactly one name: no aria-labelledby to outrank the label, no roledescription to read after it", () => {
    for (const svg of [bare(), titled()]) {
      nameDrawnDiagram(svg, "Diagram");
      expect(svg.getAttribute("aria-labelledby")).toBeNull();
      expect(svg.getAttribute("aria-roledescription")).toBeNull();
    }
  });

  it("keeps the author's accDescr as the description", () => {
    const svg = titled();
    nameDrawnDiagram(svg, "Diagram");
    expect(svg.getAttribute("aria-describedby")).toBe("chart-desc-m-1");
  });

  it("falls back to the generic name when the author's title is blank", () => {
    const svg = titled("  ");
    expect(nameDrawnDiagram(svg, "Diagram")).toBe("Diagram");
    expect(svg.getAttribute("aria-label")).toBe("Diagram");
  });
});
