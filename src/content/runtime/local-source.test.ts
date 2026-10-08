import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalSource, WikiTooLargeError } from "./local-source";

let root: string;
const add = async (name: string, body: string) => {
  await mkdir(dirname(join(root, name)), { recursive: true });
  await writeFile(join(root, name), body);
};
const text = (bytes: Uint8Array | undefined) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wr-src-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createLocalSource", () => {
  it("reads every file under POSIX wiki-relative paths, skipping only tool folders", async () => {
    await add("index.md", "# Home");
    await add("a/b/page.md", "# Page");
    await add("img/x.png", "png");
    await add(".private/secret.md", "# Secret");
    for (const tool of [".git/HEAD", ".obsidian/app.json", ".trash/old.md", "node_modules/x/index.js", ".DS_Store"]) await add(tool, "x");

    const source = createLocalSource(root, 1_000_000);
    const tree = await source.fetchTree(await source.getLatestSha());
    expect([...tree.files.keys()]).toEqual([".private/secret.md", "a/b/page.md", "img/x.png", "index.md"]);
    expect(text(tree.files.get("a/b/page.md"))).toBe("# Page");
    expect(tree.totalBytes).toBe(6 + 6 + 3 + 8);
  });

  it("the sha is stable for an unchanged folder and changes on an edit, an add and a delete", async () => {
    await add("a.md", "one");
    const source = createLocalSource(root, 1_000_000);
    const first = await source.getLatestSha();
    expect(await source.getLatestSha()).toBe(first);

    await add("a.md", "one!");
    const edited = await source.getLatestSha();
    expect(edited).not.toBe(first);

    await add("b.md", "two");
    const added = await source.getLatestSha();
    expect(added).not.toBe(edited);

    await rm(join(root, "b.md"));
    expect(await source.getLatestSha()).not.toBe(added);
  });

  it("a touch with the same size still changes the sha (mtime is part of it)", async () => {
    await add("a.md", "one");
    const source = createLocalSource(root, 1_000_000);
    const before = await source.getLatestSha();
    await utimes(join(root, "a.md"), new Date(2001, 0, 1), new Date(2001, 0, 1));
    expect(await source.getLatestSha()).not.toBe(before);
  });

  it("refuses a folder over the byte limit", async () => {
    await add("big.md", "x".repeat(100));
    const source = createLocalSource(root, 99);
    await expect(source.fetchTree(await source.getLatestSha())).rejects.toBeInstanceOf(WikiTooLargeError);
  });
});
