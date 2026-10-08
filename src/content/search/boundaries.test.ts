import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * S5 (BR-036): the index is a pure function of the shared parse. Its sources import no file system, no source adapter
 * and no Markdown parser, so it cannot read files or re-parse. The same-`Map` identity is pinned in
 * `runtime/build.test.ts`.
 */
const FILES = ["build-index.ts", "doc.ts", "types.ts"];
const FORBIDDEN = [/^node:/, /^fs(\/|$)/, /content\/runtime\/adapter/, /content\/render\/pipeline/, /content\/render\/parse/, /^(unified|remark|rehype|micromark|mdast-util-from)/];

function importsOf(file: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!);
}

describe("content/search imports (S5)", () => {
  it.each(FILES)("%s imports nothing that reads files or parses Markdown", (file) => {
    const specs = importsOf(file);
    for (const spec of specs) for (const bad of FORBIDDEN) expect(spec, `${file} imports ${spec}`).not.toMatch(bad);
  });

  it("the check sees the imports it is meant to police", () => {
    expect(importsOf("build-index.ts")).toContain("minisearch");
    expect(importsOf("doc.ts")).toContain("@/content/links/link-map");
  });
});
