import { describe, expect, it } from "vitest";

import { relativeImageAddress, toEditorText, wikiPathOfImage } from "./edit-text";

describe("toEditorText", () => {
  it("drops a byte-order mark and makes line endings LF", () => {
    expect(toEditorText("﻿a\r\nb\r\n")).toBe("a\nb\n");
  });
});

describe("wikiPathOfImage", () => {
  it("resolves a relative address against the page's folder", () => {
    expect(wikiPathOfImage("decisions/DEC-019.md", "../assets/diagram.png")).toBe("assets/diagram.png");
    expect(wikiPathOfImage("index.md", "assets/a%20b.png")).toBe("assets/a b.png");
    expect(wikiPathOfImage("guides/start.md", "./img/x.png")).toBe("guides/img/x.png");
  });

  it("leaves web, data, absolute and escaping addresses alone", () => {
    for (const src of ["https://x.test/a.png", "data:image/png;base64,AA", "/a.png", "#x", "../../a.png", ""]) {
      expect(wikiPathOfImage("guides/start.md", src), src).toBe(null);
    }
  });
});

describe("relativeImageAddress", () => {
  it("writes the address from the page's folder", () => {
    expect(relativeImageAddress("decisions/DEC-019.md", "assets/diagram.png")).toBe("../assets/diagram.png");
    expect(relativeImageAddress("index.md", "assets/diagram.png")).toBe("assets/diagram.png");
    expect(relativeImageAddress("a/b/c.md", "assets/x.png")).toBe("../../assets/x.png");
  });
});
