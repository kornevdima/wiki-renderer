import type { MermaidBlock } from "@/content/render/types";

/**
 * The view key (W2-16) is the page path plus a digest of every block's id and source (`diagramSetKey`), not the path
 * alone: after a same-path `router.refresh()` whose content changed, React rewrites the placeholder's attributes but
 * leaves the mutated children, so the effect must re-run and a block whose source changed must be drawn again.
 * `hydrateMermaid` does that through `data-mermaid-source`. Identical content keeps the key, so nothing redraws.
 */
export function diagramSetKey(pageKey: string, blocks: readonly MermaidBlock[]): string {
  let h = 0x811c9dc5;
  for (const b of blocks) {
    for (const ch of `${b.id}\u0000${b.source}\u0001`) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  }
  return `${pageKey}#${blocks.length}#${(h >>> 0).toString(16)}`;
}
