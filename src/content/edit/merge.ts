import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Keeps a saved page's untouched text byte-identical (DEC-016 note 2026-10-16).
 *
 * The editor reads the file and writes its own Markdown back, normalising what it never touched (table padding, list
 * markers, escapes). So a save is a merge of three texts:
 *
 * - `original`: the file as it was opened (its bytes on disk);
 * - `baseline`: the editor's Markdown for that file before any edit;
 * - `edited`: the editor's Markdown now.
 *
 * Every top-level block of `edited` that equals a block of `baseline` (a longest-common-subsequence match) is written
 * as the matching block of `original`, with the original's whitespace around it. A changed block that replaces exactly
 * one baseline block is merged line by line the same way, so editing one cell keeps the rest of a table, or one item
 * the rest of a list, as written. Everything else is the editor's text with Obsidian syntax unescaped
 * (`unescapeObsidian`). When the editor's view of the file doesn't line up block for block with the original, nothing
 * can be mapped back and the editor's text is used whole (`preserved: false`), so the caller can say so.
 *
 * HTML comments are invisible to the editor (it drops them), so they take no part in the mapping: they travel with the
 * original whitespace around the blocks that keep their place, attached to the block after them.
 *
 * This is a block split for editing only: the snapshot's single parse (`render/pipeline.ts`) stays the one that feeds
 * links, search and the tree.
 */
export interface MergeResult {
  text: string;
  /** False when the original could not be mapped and the editor's text was used as is. */
  preserved: boolean;
}

interface Block {
  text: string;
  start: number;
  end: number;
  comment: boolean;
}

const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm);

export function splitBlocks(source: string): Block[] {
  const tree = parser.parse(source) as Root;
  const blocks: Block[] = [];
  for (const node of tree.children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    const text = source.slice(start, end);
    blocks.push({ text, start, end, comment: node.type === "html" && /^<!--[\s\S]*-->$/.test(text.trim()) });
  }
  return blocks;
}

/** Pairs of indexes `[a, b]` with `as[a] === bs[b]`, in order, of one longest common subsequence. */
export function lcsPairs(as: readonly string[], bs: readonly string[]): Array<[number, number]> {
  const n = as.length;
  const m = bs.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = as[i] === bs[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (as[i] === bs[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

const WIKILINK = /!?\[\[[^\]\n]*\]\]/g;
const MARKDOWN_ESCAPE = /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{}~])/g;

/**
 * Undoes the escapes the editor's serializer adds to Obsidian syntax it does not know: `\[\[target]]` and
 * `!\[\[embed]]` become wikilinks again, with no escapes inside (a `\|` stays: Obsidian needs it in a table cell), and a
 * quote opening with `\[!type]` becomes a callout again.
 */
export function unescapeObsidian(text: string): string {
  return text
    .replace(/\\\[\\\[/g, "[[")
    .replace(/!\\\[\[/g, "![[")
    .replace(WIKILINK, (link) => link.replace(MARKDOWN_ESCAPE, (escape, char: string) => (char === "|" ? escape : char)))
    .replace(/^((?:[ \t]*>[ \t]?)+)\\\[!/gm, "$1[!");
}

/**
 * Maps every index of `baseline` (0..length) to an index of `original` when the two differ only by backslash escapes
 * (the serializer's `\=`, `\[`, `\_`) and emphasis markers (`*` written as `_`), or null when they differ otherwise.
 */
const EMPHASIS = new Set(["*", "_"]);

function same(a: string | undefined, b: string | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && EMPHASIS.has(a) && EMPHASIS.has(b));
}

function escapeMap(original: string, baseline: string): number[] | null {
  const map: number[] = [];
  let i = 0;
  let j = 0;
  while (j < baseline.length) {
    if (i < original.length && same(original[i], baseline[j])) {
      map[j++] = i++;
    } else if (baseline[j] === "\\" && j + 1 < baseline.length && original[i] === baseline[j + 1]) {
      map[j++] = i; // an escape the serializer added
    } else if (original[i] === "\\" && i + 1 < original.length && original[i + 1] === baseline[j]) {
      i++; // an escape the serializer dropped
    } else {
      return null;
    }
  }
  if (original.slice(i).replace(/\\/g, "") !== "") return null;
  map[baseline.length] = original.length;
  return map;
}

/**
 * One changed line: only the span the person changed (between the common prefix and suffix of `baseline` and `edited`)
 * is taken from the editor; the rest of the line is the original's, escapes and all.
 */
export function mergeLine(original: string, baseline: string, edited: string): string {
  const map = escapeMap(original, baseline);
  if (map === null) return unescapeObsidian(edited);
  let prefix = 0;
  while (prefix < baseline.length && prefix < edited.length && baseline[prefix] === edited[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < baseline.length - prefix &&
    suffix < edited.length - prefix &&
    baseline[baseline.length - 1 - suffix] === edited[edited.length - 1 - suffix]
  )
    suffix++;
  // Never cut through an escape: widen the changed span to whole escapes on both sides.
  while (prefix > 0 && baseline[prefix - 1] === "\\") prefix--;
  const changed = unescapeObsidian(edited.slice(prefix, edited.length - suffix));
  return original.slice(0, map[prefix]) + changed + original.slice(map[baseline.length - suffix]);
}

function mergeLines(original: string, baseline: string, edited: string): string {
  const o = original.split("\n");
  const b = baseline.split("\n");
  const e = edited.split("\n");
  if (o.length !== b.length) return unescapeObsidian(edited);
  const pairs = lcsPairs(b, e);
  const out = e.map((line) => unescapeObsidian(line));
  for (const [bi, ei] of pairs) out[ei] = o[bi]!;
  // A run of one changed line for one baseline line is an edit of that line.
  const anchors: Array<[number, number]> = [[-1, -1], ...pairs, [b.length, e.length]];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [b0, e0] = anchors[k]!;
    const [b1, e1] = anchors[k + 1]!;
    if (b1 - b0 === 2 && e1 - e0 === 2) out[e0 + 1] = mergeLine(o[b0 + 1]!, b[b0 + 1]!, e[e0 + 1]!);
  }
  return out.join("\n");
}

function withFinalNewline(text: string): string {
  return text === "" || text.endsWith("\n") ? text : text + "\n";
}

export function mergeEdit(original: string, baseline: string, edited: string): MergeResult {
  if (edited === baseline) return { text: original, preserved: true };
  const o = splitBlocks(original).filter((x) => !x.comment);
  const b = splitBlocks(baseline).filter((x) => !x.comment);
  const e = splitBlocks(edited);
  if (o.length !== b.length || e.length === 0) return { text: withFinalNewline(unescapeObsidian(edited)), preserved: false };

  // Each edited block keeps an original block (`from`, an exact match), replaces one (`slot` only), or is new.
  const pairs = lcsPairs(
    b.map((x) => x.text),
    e.map((x) => x.text),
  );
  const pieces: Array<{ text: string; from?: number; slot?: number }> = e.map((block) => ({ text: block.text }));
  for (const [bi, ei] of pairs) pieces[ei] = { text: o[bi]!.text, from: bi, slot: bi };

  // Unmatched runs between two anchors: a run of one edited block for one baseline block is a modification.
  const anchors: Array<[number, number]> = [[-1, -1], ...pairs, [b.length, e.length]];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [b0, e0] = anchors[k]!;
    const [b1, e1] = anchors[k + 1]!;
    if (b1 - b0 === 2 && e1 - e0 === 2) pieces[e0 + 1] = { text: mergeLines(o[b0 + 1]!.text, b[b0 + 1]!.text, e[e0 + 1]!.text), slot: b0 + 1 };
  }
  for (const piece of pieces) if (piece.from === undefined) piece.text = unescapeObsidian(piece.text);

  // Whitespace (and the comments in it): the original's before a block whose original predecessor is the last placed
  // block, the editor's elsewhere.
  const first = pieces[0]!;
  const last = pieces[pieces.length - 1]!;
  let text = first.slot === 0 ? original.slice(0, o[0]!.start) : edited.slice(0, e[0]!.start);
  let lastSlot = first.slot ?? -1;
  pieces.forEach((piece, ei) => {
    if (ei > 0) {
      if (piece.slot !== undefined && piece.slot > 0 && lastSlot === piece.slot - 1) {
        // After a new block too: the comments above this block stay with it, the new block takes the editor's spacing before it.
        text += original.slice(o[piece.slot - 1]!.end, o[piece.slot]!.start);
      } else {
        text += edited.slice(e[ei - 1]!.end, e[ei]!.start);
      }
    }
    text += piece.text;
    if (piece.slot !== undefined) lastSlot = piece.slot;
  });
  text += last.slot === o.length - 1 ? original.slice(o[o.length - 1]!.end) : edited.slice(e[e.length - 1]!.end);
  return { text: withFinalNewline(text), preserved: true };
}
