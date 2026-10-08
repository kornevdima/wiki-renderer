import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "@/content/runtime/types";

vi.mock("./pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline")>();
  return { ...actual, parseMarkdown: vi.fn(actual.parseMarkdown) };
});

import { sanitizeSchema } from "./sanitize-schema";
import { parsePages } from "./parse";
import { parseMarkdown } from "./pipeline";

const enc = new TextEncoder();
function files(entries: Record<string, string>): Map<string, FileEntry> {
  return new Map(
    Object.entries(entries).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "text/markdown" }]),
  );
}
function one(path: string, text: string) {
  const page = parsePages(files({ [path]: text })).get(path);
  if (!page) throw new Error("page missing");
  return page;
}

beforeEach(() => vi.mocked(parseMarkdown).mockClear());

describe("parsePages: selection", () => {
  it("parses each .md file once and skips other entries", () => {
    const pages = parsePages(files({ "a.md": "# A", "docs/b.MD": "# B", "img/x.png": "not markdown", "c.txt": "x" }));
    expect([...pages.keys()]).toEqual(["a.md", "docs/b.MD"]);
    expect(parseMarkdown).toHaveBeenCalledTimes(2);
  });
});

describe("parsePages: title (S2, S3, TC-200)", () => {
  it("uses frontmatter title", () => {
    expect(one("x.md", "---\ntitle: Project Brief\n---\n# Body").title).toBe("Project Brief");
  });
  it.each([
    ["no title", "# Body"],
    ["empty title", '---\ntitle: ""\n---\nbody'],
    ["whitespace title", '---\ntitle: "   "\n---\nbody'],
    ["non-string title", "---\ntitle: 42\n---\nbody"],
  ])("falls back to the filename stem (%s)", (_n, text) => {
    expect(one("Setup Guide.md", text).title).toBe("Setup Guide");
  });
  it("strips folders from the stem", () => {
    expect(one("docs/Setup Guide.md", "body").title).toBe("Setup Guide");
  });
});

describe("parsePages: frontmatter robustness (S5, TC-202)", () => {
  it.each([
    ["malformed", "---\ntitle: [unclosed\n---\nbody"],
    ["scalar", "---\n42\n---\nbody"],
    ["list", "---\n- a\n- b\n---\nbody"],
    ["absent", "body"],
    ["empty block", "---\n---\nbody"],
  ])("%s gives {} and the filename title", (_n, text) => {
    const page = one("notes/Plan.md", text);
    expect(page.frontmatter).toEqual({});
    expect(page.title).toBe("Plan");
  });
  it("keeps raw fields on frontmatter", () => {
    expect(one("x.md", "---\ntitle: T\nstatus: draft\n---\n").frontmatter).toEqual({ title: "T", status: "draft" });
  });
});

describe("parsePages: aliases", () => {
  it("lowercases list entries", () => {
    expect(one("x.md", "---\naliases: [Foo, BAR]\n---\n").aliases).toEqual(["foo", "bar"]);
  });
  it("counts a single string as one", () => {
    expect(one("x.md", "---\naliases: Solo\n---\n").aliases).toEqual(["solo"]);
  });
  it("ignores non-strings and absence", () => {
    expect(one("x.md", "---\naliases: [1, {a: 1}, ok]\n---\n").aliases).toEqual(["ok"]);
    expect(one("x.md", "body").aliases).toEqual([]);
  });
});

describe("parsePages: headings and rawText (S7, TR-019)", () => {
  it("de-duplicates slugs like rehype-slug", () => {
    const page = one("x.md", "## Setup\n\ntext\n\n## Setup\n\n### Other `code`\n");
    expect(page.headings).toEqual([
      { depth: 2, text: "Setup", slug: "setup" },
      { depth: 2, text: "Setup", slug: "setup-1" },
      { depth: 3, text: "Other code", slug: "other-code" },
    ]);
  });
  it("tags rawText by section", () => {
    const page = one("x.md", "intro\n\n# One\n\nalpha\n\n```js\ncode()\n```\n\n## Two\n\n| a | b |\n|---|---|\n| c | d |\n");
    expect(page.rawText.split("\u001e").slice(1)).toEqual([
      "\nintro\n",
      "one\nOne\nalpha\ncode()\n",
      "two\nTwo\na\nb\nc\nd",
    ]);
  });
});

describe("parsePages: P3 security (W1-6)", () => {
  it("never executes a ---js block", () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__us070_pwned;
    const page = one(
      "Guide.md",
      '---js\n({ title: (globalThis.__us070_pwned = 1, "x") })\n---\nbody',
    );
    expect(g.__us070_pwned).toBeUndefined();
    expect(page.frontmatter).toEqual({});
    expect(page.title).toBe("Guide");
  });
  it("returns a hostile title as the exact plain string", () => {
    const title = "</title><script>alert(1)</script>";
    expect(one("x.md", `---\ntitle: '${title}'\n---\n`).title).toBe(title);
  });
  it("keeps a !!js tag inert (core schema, no custom tags)", () => {
    const page = one("Guide.md", "---\ntitle: !!js/function 'function () { return 1 }'\n---\n");
    expect(typeof page.title).toBe("string");
    expect(Object.values(page.frontmatter).every((v) => typeof v !== "function")).toBe(true);
  });
  it("bounds an alias bomb to an empty frontmatter", () => {
    const levels = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 12; i++) {
      const prev = String.fromCharCode(96 + i);
      const next = String.fromCharCode(97 + i);
      levels.push(`${next}: &${next} [${Array(10).fill(`*${prev}`).join(", ")}]`);
    }
    const started = Date.now();
    const page = one("Bomb.md", `---\n${levels.join("\n")}\n---\n`);
    expect(page.frontmatter).toEqual({});
    expect(page.title).toBe("Bomb");
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("does not throw on a ragged table", () => {
    expect(() => one("x.md", "| a | b |\n|---\n| 1 |\n| 1 | 2 | 3 |\n")).not.toThrow();
  });
});

describe("parsePages: parse count (S4, BR-036)", () => {
  it("parses N files exactly N times", () => {
    parsePages(files({ "a.md": "a", "b.md": "b", "c.md": "c" }));
    expect(parseMarkdown).toHaveBeenCalledTimes(3);
  });
});

describe("parsePages: immutable output (BR-036)", () => {
  it("freezes the headings array and each HeadingEntry", () => {
    const page = parsePages(files({ "p.md": "# A\n\n## B\n" })).get("p.md")!;
    expect(Object.isFrozen(page.headings)).toBe(true);
    expect(page.headings).toHaveLength(2);
    for (const h of page.headings) expect(Object.isFrozen(h)).toBe(true);
    expect(() => {
      (page.headings[0] as { slug: string }).slug = "x";
    }).toThrow(TypeError);
  });
});

describe("parsePages: rawText holds visible text only (OA-1, TC-469)", () => {
  const raw = (md: string) => parsePages(new Map([["a.md", { bytes: new TextEncoder().encode(md), contentType: "text/markdown" }]])).get("a.md")!;

  it("drops inline HTML comments and tags and the text between inline script / style, and keeps the rest", () => {
    const { rawText } = raw("a <!-- hid --> b <b>c</b> <script>js</script> <style>css</style> d\n");
    expect(rawText).toBe("\u001e\na  b c   d");
  });

  it("a heading's comment stays out of its rawText line but the heading entry and slug are unchanged", () => {
    const page = raw("# Head <!-- hid --> tail\n");
    expect(page.rawText).toBe("\u001ehead----hid----tail\nHead tail");
    expect(page.headings[0]).toMatchObject({ text: "Head <!-- hid --> tail", slug: "head----hid----tail" });
  });

  it("hides every element the sanitiser strips with its content (the list is read from the sanitiser schema)", () => {
    for (const tag of sanitizeSchema.strip ?? []) {
      if (tag === "embed") continue;
      expect(raw(`a <${tag}>zzhidden</${tag}> b\n`).rawText, tag).toBe("\u001e\na  b");
    }
  });

  it("a void <embed> hides nothing after it", () => {
    expect(raw("a <embed src=x> b\n").rawText).toBe("\u001e\na  b");
  });

  it("a multi-line setext heading is one line in rawText", () => {
    expect(raw("line one\nline two\n===\n\nbody\n").rawText).toBe("\u001eline-oneline-two\nline one line two\nbody");
  });

  it("an unclosed inline script hides the rest of its paragraph only", () => {
    expect(raw("a <script>js\n\nnext\n").rawText).toBe("\u001e\na \nnext");
  });
});
