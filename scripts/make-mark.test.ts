// US-289 R4: the generated mark files match the accepted spec (variant C). They are committed; `scripts/make-mark.mjs` regenerates them.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ico, markSvg } from "./make-mark.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string): Buffer => readFileSync(resolve(root, rel));

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("the WR mark SVG", () => {
  const svg = read("public/wr-mark.svg").toString("utf8");

  it("is a 64 x 64 tile clipped to radius 12, with the lettering as one white path", () => {
    expect(svg).toMatch(/<svg [^>]*viewBox="0 0 64 64"/);
    expect(svg).toMatch(/<clipPath id="wr-clip"><rect width="64" height="64" rx="12"\/><\/clipPath>/);
    expect(svg).toContain('clip-path="url(#wr-clip)"');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toMatch(/<path fill="#ffffff" d="M[^"]+Z"\/>/);
  });

  it("holds no text, image, font or script, so it needs nothing at run time", () => {
    expect(svg).not.toMatch(/<text|<image|<style|<script|<foreignObject|font-|@font-face|href=/i);
  });

  it("is under 3 KB", () => {
    expect(svg.length).toBeLessThan(3 * 1024);
  });

  it("is the same file for the tab icon", () => {
    expect(read("src/app/icon.svg").equals(read("public/wr-mark.svg"))).toBe(true);
  });

  it("lettering stays inside the tile and is centred on the ink", () => {
    const d = /<path fill="#ffffff" d="([^"]+)"/.exec(svg)![1]!;
    const nums = d.replace(/[MLQCZ]/g, " ").trim().split(/\s+/).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(32, 0);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(32, 0);
    expect((Math.max(...ys) - Math.min(...ys)) / 64).toBeCloseTo(0.34, 2); // cap height, 34 % of the tile
  });
});

describe("the WR mark rasters", () => {
  it("icon.png is 32 px and apple-icon.png is 180 px", () => {
    expect(pngSize(read("src/app/icon.png"))).toEqual({ width: 32, height: 32 });
    expect(pngSize(read("src/app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("favicon.ico carries a 16 px and a 32 px PNG entry", () => {
    const file = read("src/app/favicon.ico");
    expect(file.readUInt16LE(0)).toBe(0);
    expect(file.readUInt16LE(2)).toBe(1); // type: icon
    const count = file.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = 6 + 16 * i;
      const size = file[at]!;
      const png = file.subarray(file.readUInt32LE(at + 12), file.readUInt32LE(at + 12) + file.readUInt32LE(at + 8));
      expect(pngSize(png)).toEqual({ width: size, height: size });
      sizes.push(size);
    }
    expect(sizes).toEqual([16, 32]);
  });
});

describe("make-mark helpers", () => {
  const ground = '<svg><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>\n  <g>\n    <rect width="64" height="64" fill="url(#g)"/>\n  </g>\n</svg>';

  it("markSvg clips the ground by default and leaves the apple variant full bleed", () => {
    expect(markSvg(ground, "M0 0Z")).toContain('<g clip-path="url(#wr-clip)">');
    const bleed: string = markSvg(ground, "M0 0Z", false);
    expect(bleed).not.toContain("clip");
  });

  it("markSvg refuses a ground without defs and a group", () => {
    expect(() => markSvg("<svg/>", "M0 0Z")).toThrow(/defs/);
  });

  it("ico writes the directory entries with sizes, lengths and offsets", () => {
    const a = Buffer.from("aa");
    const b = Buffer.from("bbbb");
    const file: Buffer = ico([{ size: 16, png: a }, { size: 32, png: b }]);
    expect(file.readUInt16LE(4)).toBe(2);
    expect(file[6]).toBe(16);
    expect(file.readUInt32LE(6 + 8)).toBe(2);
    expect(file.readUInt32LE(6 + 12)).toBe(38);
    expect(file.readUInt32LE(22 + 12)).toBe(40);
    expect(file.subarray(38).toString()).toBe("aabbbb");
  });
});
