// US-278 R1 on the real thing: an unpacked archive holds no native module but the bundled node, no .env*, no src/, no tests/.
// The unit tests in package.test.ts pin the packer's own predicates; this one checks the output with predicates of its own.
// It needs an unpacked archive, so it runs when WR_UNPACKED names the top folder (see AGENTS.md; the release workflow's smoke
// step runs after the same unpack). Without it the cases are skipped, and say so.
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.env.WR_UNPACKED;

function walk(dir: string, rel = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    return statSync(abs).isDirectory() ? walk(abs, r) : [r];
  });
}

describe.skipIf(!root)("unpacked portable archive (WR_UNPACKED)", () => {
  const files = root ? walk(root) : [];

  it("is not empty and carries the runtime, the server and the CLI", () => {
    for (const must of ["bin/node", "server.js", "cli.mjs", "package.json", "wiki-renderer", "wiki-renderer.cmd"]) {
      expect(files, must).toContain(must.replace("bin/node", files.includes("bin/node.exe") ? "bin/node.exe" : "bin/node"));
    }
  });
  it("has no native module except the bundled node binary", () => {
    const native = files.filter((f) => /\.(node|dylib|so|dll)$/i.test(f) || /\.so\.\d/.test(f));
    expect(native).toEqual([]);
    expect(files.filter((f) => /(^|\/)sharp(\/|$)|@img\//.test(f))).toEqual([]);
  });
  it("has no ELF, Mach-O or PE file but the bundled node, whatever it is called", () => {
    const isNativeHead = (head: Buffer) => {
      const m = head.length >= 4 ? head.readUInt32BE(0) : 0;
      if (m === 0x7f454c46 || [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m)) return true;
      if (head.length >= 0x40 && head[0] === 0x4d && head[1] === 0x5a) {
        const at = head.readUInt32LE(0x3c);
        return at + 4 <= head.length && head.toString("latin1", at, at + 4) === "PE\0\0";
      }
      return false;
    };
    const found = files.filter((f) => {
      if (f === "bin/node" || f === "bin/node.exe" || f.endsWith(".wasm")) return false;
      const fd = openSync(path.join(root!, f), "r");
      try {
        const head = Buffer.alloc(1024);
        return isNativeHead(head.subarray(0, readSync(fd, head, 0, 1024, 0)));
      } finally {
        closeSync(fd);
      }
    });
    expect(found).toEqual([]);
  });
  it("has no .env* file anywhere, and no src/ or tests/ folder at the root", () => {
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f.replace(/^node_modules\/.*\//, "")) && !f.startsWith("node_modules/"))).toEqual([]);
    expect(files.filter((f) => f.startsWith("src/") || f.startsWith("tests/"))).toEqual([]);
  });
  it("has no .DS_Store and no sample wiki fixtures", () => {
    expect(files.filter((f) => path.basename(f) === ".DS_Store" || f.includes("fixtures/sample-wiki"))).toEqual([]);
  });
});
