import { describe, expect, it } from "vitest";
import { createSlugger, slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Getting Started")).toBe("getting-started");
  });
  it("drops punctuation", () => {
    expect(slugify("Hello, World! (v2)")).toBe("hello-world-v2");
  });
  it("keeps unicode letters", () => {
    expect(slugify("Über Café Straße")).toBe("über-café-straße");
  });
  it("is stateless: the same text gives the same slug", () => {
    expect(slugify("Setup")).toBe(slugify("Setup"));
  });
});

describe("createSlugger", () => {
  it("de-duplicates per slugger in document order", () => {
    const next = createSlugger();
    expect([next("Setup"), next("Setup"), next("Setup")]).toEqual(["setup", "setup-1", "setup-2"]);
  });
  it("is independent between instances", () => {
    createSlugger()("Setup");
    expect(createSlugger()("Setup")).toBe("setup");
  });
});
