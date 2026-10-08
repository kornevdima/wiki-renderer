import { describe, expect, it } from "vitest";

import { readerWikiFor } from "./reader-wiki";

describe("readerWikiFor", () => {
  it("carries the name and the folder, nothing else", () => {
    expect(readerWikiFor({ id: "pm", name: "Pm", root: "/vaults/pm/wiki" })).toStrictEqual({ name: "Pm", folder: "/vaults/pm/wiki" });
  });
});
