import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { hashText, isSavablePath, safeAssetName, saveAsset, savePage } from "./local-write";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "wr-write-"));
  outside = await mkdtemp(path.join(tmpdir(), "wr-outside-"));
  await mkdir(path.join(root, "guides"));
  await writeFile(path.join(root, "guides", "start.md"), "# Start\n");
  await writeFile(path.join(outside, "secret.md"), "secret\n");
});

const upper = (text: string) => text.toUpperCase();

describe("savePage", () => {
  it("writes the computed text and returns its hash", async () => {
    const result = await savePage(root, "guides/start.md", hashText("# Start\n"), upper);
    expect(result).toEqual({ ok: true, changed: true, hash: hashText("# START\n"), text: "# START\n" });
    expect(await readFile(path.join(root, "guides", "start.md"), "utf8")).toBe("# START\n");
    expect(await readdir(path.join(root, "guides"))).toEqual(["start.md"]);
  });

  it("refuses when the file changed on disk since it was opened, and writes nothing", async () => {
    const result = await savePage(root, "guides/start.md", hashText("# Old\n"), upper);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(await readFile(path.join(root, "guides", "start.md"), "utf8")).toBe("# Start\n");
  });

  it("writes nothing when the text is unchanged", async () => {
    const result = await savePage(root, "guides/start.md", hashText("# Start\n"), (t) => t);
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it("refuses a page that doesn't exist (a save never creates files)", async () => {
    expect(await savePage(root, "guides/new.md", hashText(""), upper)).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses a symlink that leads out of the wiki", async () => {
    await symlink(path.join(outside, "secret.md"), path.join(root, "link.md"));
    expect(await savePage(root, "link.md", hashText("secret\n"), upper)).toEqual({ ok: false, reason: "outside_wiki" });
    expect(await readFile(path.join(outside, "secret.md"), "utf8")).toBe("secret\n");
  });

  it("keeps the file's CRLF line endings and byte-order mark", async () => {
    const raw = "﻿# Start\r\nText\r\n";
    await writeFile(path.join(root, "crlf.md"), raw);
    let seen = "";
    const result = await savePage(root, "crlf.md", hashText(raw), (t) => ((seen = t), t.replace("Text", "More")));
    expect(seen).toBe("# Start\nText\n");
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(await readFile(path.join(root, "crlf.md"), "utf8")).toBe("﻿# Start\r\nMore\r\n");
  });
});

describe("isSavablePath", () => {
  it("accepts a relative Markdown path", () => {
    expect(isSavablePath("guides/start.md")).toBe(true);
    expect(isSavablePath(".github/notes.md")).toBe(true);
  });

  it("refuses traversal, absolute paths, other types and tool folders", () => {
    for (const rel of ["../x.md", "a/../b.md", "/etc/x.md", "a\\b.md", "notes.txt", ".git/x.md", "a/node_modules/x.md", ".obsidian/x.md", "a//b.md", ""]) {
      expect(isSavablePath(rel), rel).toBe(false);
    }
  });
});

describe("saveAsset", () => {
  const png = new Uint8Array([137, 80, 78, 71]);

  it("writes into assets/ at the wiki root and never over an existing file", async () => {
    expect(await saveAsset(root, "Flow Diagram.PNG", png)).toEqual({ ok: true, path: "assets/Flow-Diagram.png" });
    expect(await saveAsset(root, "Flow Diagram.PNG", png)).toEqual({ ok: true, path: "assets/Flow-Diagram-1.png" });
    expect((await readdir(path.join(root, "assets"))).sort()).toEqual(["Flow-Diagram-1.png", "Flow-Diagram.png"]);
  });

  it("refuses a type that isn't an image, an empty file and one over the limit", async () => {
    expect(await saveAsset(root, "notes.md", png)).toEqual({ ok: false, reason: "invalid_type" });
    expect(await saveAsset(root, "x.png", new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(await saveAsset(root, "x.png", new Uint8Array(10 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "too_large" });
  });

  it("makes names safe: no folders, no spaces or accents, lower-case extension", () => {
    expect(safeAssetName("../../etc/passwd.png")).toBe("passwd.png");
    expect(safeAssetName("Café menu (v2).JPG")).toBe("Cafe-menu-v2.jpg");
    expect(safeAssetName("....png")).toBe("image.png");
    expect(safeAssetName("###.webp")).toBe("image.webp");
    expect(safeAssetName("script.svg.exe")).toBe(null);
  });
});
