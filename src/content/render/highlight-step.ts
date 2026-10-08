import type { Element, Parents, Root } from "hast";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { visit } from "unist-util-visit";
import { getHighlighter, HIGHLIGHT_LANGUAGE_TAGS, HIGHLIGHT_THEME, MAX_HIGHLIGHT_CHARS } from "./highlighter";

/**
 * The Shiki rehype step (US-072, ADR-010). Runs after `rehypeStripAuthorAttrs` and the Mermaid placeholder, before
 * `rehypePrefixFragmentLinks` and the sanitiser. It is synchronous: the highlighter is primed in `build()` and every
 * language is preloaded, and `lazy` is never set (a lazy load would make `runSync` throw).
 *
 * Routing is decided here, not by Shiki, so the rules are ours and pinned by spec:
 * - the language is the first word of the info string (`remark-rehype` already splits off the rest as `meta`, which
 *   is never read), matched case-insensitively against the eleven preloaded languages and their aliases (TC-204);
 * - anything else (no language, an unlisted one, `mermaid`, a hostile tag) and any block over `MAX_HIGHLIGHT_CHARS`
 *   is hidden from Shiki for the duration of the call, so it stays a plain `pre > code` with its own class (TC-442);
 * - the sum of highlighted characters in one render is capped (`HIGHLIGHT_BUDGET_CHARS`); a block that would pass it
 *   renders plain, and so does every later one that does not fit (W2-15);
 * - no primed highlighter means no highlighting at all, never a throw.
 */

function textOf(node: Element): string {
  return node.children.map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : "")).join("");
}

function languageClass(code: Element): string | undefined {
  const classes = code.properties?.className;
  if (!Array.isArray(classes)) return undefined;
  return classes.find((c): c is string => typeof c === "string" && c.startsWith("language-"));
}

export function rehypeHighlight() {
  return (tree: Root, file: { data: object }): void => {
    const highlighter = getHighlighter();
    if (!highlighter) return;
    // Per-render cumulative budget (W2-15), from the render's own `VFile`; absent (a bare call) means unbudgeted.
    const budget = (file.data as { highlightBudget?: { remaining: number } }).highlightBudget;

    const restore: (() => void)[] = [];
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre" || node.children.length !== 1) return;
      const code = node.children[0];
      if (code?.type !== "element" || code.tagName !== "code") return;
      const original = code.properties?.className;
      const lang = languageClass(code)?.slice("language-".length).toLowerCase();
      const size = lang !== undefined && HIGHLIGHT_LANGUAGE_TAGS.has(lang) ? textOf(code).length : Infinity;
      const routable = size <= MAX_HIGHLIGHT_CHARS && (budget === undefined || size <= budget.remaining);
      if (routable && budget) budget.remaining -= size;
      if (routable) {
        code.properties.className = [`language-${lang}`];
      } else {
        delete code.properties.className;
      }
      restore.push(() => {
        // A block Shiki replaced is detached, so this is harmless there; a plain one gets its author-written class back.
        if (original === undefined) delete code.properties.className;
        else code.properties.className = original;
      });
    });

    const shiki = rehypeShikiFromHighlighter(highlighter, {
      theme: HIGHLIGHT_THEME,
      // No `style` on `pre` (ADR-010 amendment 2026-10-05): the content stylesheet grounds the block on surface-muted.
      rootStyle: false,
    });
    try {
      // Sync by construction (see above); the cast is the transformer's own optional-Promise return type.
      shiki(tree, file as never, () => undefined);
    } finally {
      for (const r of restore) r();
    }
    normaliseShikiOutput(tree);
  };
}

/**
 * Shiki's hast is not the shape the rest of the chain speaks (measured, spike S3 + the unit specs): it puts a nested
 * `root` where the `pre` was and names its properties as HTML attributes (`class` string, `tabindex` string) rather
 * than hast property names (`className` array, `tabIndex` number), which the sanitiser's exact lists would not match.
 * This maps only those two names and unwraps the roots. Author elements cannot carry `class` / `tabindex` here: the
 * parser gives hast names (`className`, `tabIndex`) and `rehypeStripAuthorAttrs` already removed the reserved ones, so
 * nothing an author wrote is renamed into an allowed form.
 */
function normaliseShikiOutput(tree: Root): void {
  visit(tree, "element", (node: Element) => {
    const props = node.properties;
    if (typeof props.class === "string") {
      props.className = props.class.split(/\s+/).filter(Boolean);
      delete props.class;
    }
    if (typeof props.tabindex === "string") {
      props.tabIndex = Number(props.tabindex);
      delete props.tabindex;
    }
  });
  visit(tree, "root", (node, index, parent) => {
    if (!parent || index === undefined || node === tree) return;
    (parent as Parents).children.splice(index, 1, ...(node.children as never[]));
    return index;
  });
}
