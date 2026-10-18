import { describe, expect, it } from "vitest";

import { helpText } from "./help";

describe("helpText", () => {
  it("names the version, every command and every option", () => {
    const text = helpText("1.2.3");
    expect(text).toContain("Wiki Renderer 1.2.3");
    for (const word of ["start", "add <folder>", "remove <id>", "list", "--port <n>", "--no-open", "--id <id>", "--version", "--help", "WIKI_DIRS", "WIKI_RENDERER_CONFIG"]) {
      expect(text, word).toContain(word);
    }
  });
});
