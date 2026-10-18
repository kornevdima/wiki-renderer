// Regenerates the default "WR" mark (US-289) and its tab icons. Run by hand when the design changes; the outputs are committed and
// nothing here runs at build or ships in an archive.
//
//   node scripts/make-mark.mjs [--ground <esg-background.svg>]
//     --ground   the ESG ground, a true-vector 64 x 64 square: registry/esg/assets/esg-background.svg in the esg-design-system
//                checkout (or set ESG_BACKGROUND_SVG). Source of the committed files: esg-design-system f8706a1
//
// Variant C (operator, 2026-10-17): the ground clipped to a 64 x 64 square with radius 12, and "WR" in white Figtree at weight 800,
// cap height 34 % of the tile, tracking -1, centred on the ink, outlined to paths so no font is needed at run time. The colours come
// from the design system's ground; none is written here except the lettering's white.
//
// Tools (dev only, none ships): wawoff2 turns src/fonts/Figtree-latin.woff2 into a TTF and fontkit reads the variable font at wght 800
// and outlines the glyphs; Playwright's Chromium (already the e2e browser) rasterises the SVG. fontkit's own WOFF2 path cannot
// instantiate a variable font, hence the wawoff2 step.
//
// Writes: public/wr-mark.svg (the TenantLogo's image), src/app/icon.svg, src/app/icon.png (32), src/app/apple-icon.png (180, full
// bleed: iOS rounds it itself) and src/app/favicon.ico (16 and 32, PNG entries).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";
import { chromium } from "@playwright/test";
import wawoff2 from "wawoff2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TILE = 64;
export const RADIUS = 12;
export const WEIGHT = 800;
export const CAP_HEIGHT_SHARE = 0.34;
export const TRACKING = -1; // tile units

const num = (n) => String(Math.round(n * 100) / 100);

/** The "WR" outlines in tile units, centred on the ink. */
export function lettering(font) {
  const run = font.layout("WR");
  const scale = (TILE * CAP_HEIGHT_SHARE) / font.capHeight;
  let x = 0;
  const placed = run.glyphs.map((glyph, i) => {
    const at = x;
    x += run.positions[i].xAdvance * scale + (i < run.glyphs.length - 1 ? TRACKING : 0);
    return { glyph, at };
  });
  const ink = placed.map(({ glyph, at }) => ({ min: at + glyph.bbox.minX * scale, max: at + glyph.bbox.maxX * scale }));
  const left = Math.min(...ink.map((i) => i.min));
  const right = Math.max(...ink.map((i) => i.max));
  const top = Math.max(...placed.map(({ glyph }) => glyph.bbox.maxY)) * scale;
  const bottom = Math.min(...placed.map(({ glyph }) => glyph.bbox.minY)) * scale;
  const dx = TILE / 2 - (left + right) / 2;
  const dy = TILE / 2 + (top + bottom) / 2; // font y runs up, the tile's runs down
  const point = (at, px, py) => `${num(at + px * scale + dx)} ${num(dy - py * scale)}`;
  return placed
    .map(({ glyph, at }) =>
      glyph.path.commands
        .map(({ command, args }) => {
          const pairs = [];
          for (let k = 0; k < args.length; k += 2) pairs.push(point(at, args[k], args[k + 1]));
          return { moveTo: "M", lineTo: "L", quadraticCurveTo: "Q", bezierCurveTo: "C", closePath: "Z" }[command] + pairs.join(" ");
        })
        .join(""),
    )
    .join("");
}

/** The mark as SVG. `clipped` false gives the full-bleed square (the apple icon). */
export function markSvg(ground, letters, clipped = true) {
  const defs = /<defs>([\s\S]*?)<\/defs>/.exec(ground)?.[1];
  const body = /<g>([\s\S]*?)<\/g>/.exec(ground)?.[1];
  if (!defs || !body) throw new Error("the ground SVG needs <defs> and one <g>");
  const squash = (s) => s.replace(/>\s+</g, "><").trim();
  const clip = clipped ? `<clipPath id="wr-clip"><rect width="${TILE}" height="${TILE}" rx="${RADIUS}"/></clipPath>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">` +
    `<defs>${squash(defs)}${clip}</defs>` +
    `<g${clipped ? ' clip-path="url(#wr-clip)"' : ""}>${squash(body)}</g>` +
    `<path fill="#ffffff" d="${letters}"/></svg>\n`
  );
}

/** An .ico of PNG entries (16 and 32 px). */
export function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    head[at] = size;
    head[at + 1] = size;
    head.writeUInt16LE(1, at + 4); // planes
    head.writeUInt16LE(32, at + 6); // bits per pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.png)]);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--ground");
  const given = flag >= 0 ? args[flag + 1] : process.env.ESG_BACKGROUND_SVG;
  if (!given) throw new Error("name the ESG ground: --ground <path to esg-background.svg> (see the header)");
  const groundPath = path.resolve(given);
  const ground = await readFile(groundPath, "utf8");

  const ttf = Buffer.from(await wawoff2.decompress(await readFile(path.join(root, "src/fonts/Figtree-latin.woff2"))));
  const font = fontkit.create(ttf).getVariation({ wght: WEIGHT });
  const letters = lettering(font);
  const svg = markSvg(ground, letters);
  const bleed = markSvg(ground, letters, false);

  const browser = await chromium.launch();
  const raster = async (source, size) => {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}"></body></html>`,
    );
    await page.waitForFunction("document.images[0].complete");
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    return png;
  };
  const png16 = await raster(svg, 16);
  const png32 = await raster(svg, 32);
  const png180 = await raster(bleed, 180);
  await browser.close();

  const out = (rel, data) => writeFile(path.join(root, rel), data).then(() => console.log(`${rel}  ${data.length} bytes`));
  await out("public/wr-mark.svg", svg);
  await out("src/app/icon.svg", svg);
  await out("src/app/icon.png", png32);
  await out("src/app/apple-icon.png", png180);
  await out("src/app/favicon.ico", ico([{ size: 16, png: png16 }, { size: 32, png: png32 }]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
