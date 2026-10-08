import type { Element, ElementContent, Root } from "hast";
import { visit, SKIP } from "unist-util-visit";
import { MERMAID_CAPTION } from "./mermaid-copy";
import type { MermaidBlock } from "./types";

/**
 * Mermaid fence -> inert placeholder (US-086, TR-013, ADR-011). Evaluation-free: this module never imports
 * `mermaid`; drawing is the browser's (US-104). A fence is emitted as
 * `<div data-mermaid-id data-mermaid-source><p data-mermaid-caption>caption</p><pre><code>source</code></pre></div>`, so
 * the source is both the attribute (for the client hydrator) and the text (readable with no JavaScript), and the caption
 * says why it is source (US-104, W2-6; the hydrator removes it once the diagram is drawn). The source is never validated
 * here: an invalid diagram still gets its placeholder (TC-223). Escaping is the serialiser's job (React's, on
 * output), which is what makes `"`, `<`, `>`, `&` and `'` round-trip (TC-224).
 *
 * Runs after `rehypeStripAuthorAttrs`, so the data attributes set here are the only ones that exist, and the
 * sanitiser schema admits them on `div` only.
 *
 * Ids are `mermaid-<8 hex of FNV-1a(path)>-<block index>`: deterministic from the page path and the block index, so
 * the same page at the same sha renders identical ids, and unique within a page. Never random.
 */
export function mermaidBlockId(path: string, index: number): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h = Math.imul(h ^ path.charCodeAt(i), 0x01000193);
  }
  return `mermaid-${(h >>> 0).toString(16).padStart(8, "0")}-${index}`;
}

function textOf(node: Element): string {
  return node.children.map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : "")).join("");
}

// An author-written raw `<pre><code class="language-mermaid">` also matches: accepted as benign, same trust as a fence.
function isMermaidFence(node: Element): Element | undefined {
  if (node.tagName !== "pre" || node.children.length !== 1) return undefined;
  const code = node.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return undefined;
  const classes = code.properties?.className;
  return Array.isArray(classes) && classes.includes("language-mermaid") ? code : undefined;
}

export function rehypeMermaidPlaceholder() {
  return (tree: Root, file: { path?: string }): void => {
    const path = file.path || "";
    let index = 0;
    visit(tree, "element", (node: Element, position, parent) => {
      const code = isMermaidFence(node);
      if (!code || !parent || position === undefined) return;
      // remark-rehype appends one "\n" to a fence's text; the source is what the author wrote.
      const source = textOf(code).replace(/\n$/, "");
      const child: ElementContent = {
        type: "element",
        tagName: "pre",
        properties: {},
        children: [{ type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: source }] }],
      };
      parent.children[position] = {
        type: "element",
        tagName: "div",
        properties: { dataMermaidId: mermaidBlockId(path, index++), dataMermaidSource: source },
        children: [
          {
            type: "element",
            tagName: "p",
            properties: { dataMermaidCaption: "" },
            children: [{ type: "text", value: MERMAID_CAPTION }],
          },
          child,
        ],
      };
      return SKIP;
    });
  };
}

/** The blocks that survived the sanitiser, in document order (`RenderedPage.mermaidBlocks`). */
export function collectMermaidBlocks(tree: Root): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  visit(tree, "element", (node: Element) => {
    const id = node.properties?.dataMermaidId;
    const source = node.properties?.dataMermaidSource;
    if (typeof id === "string" && typeof source === "string") blocks.push(Object.freeze({ id, source }));
  });
  return blocks;
}
