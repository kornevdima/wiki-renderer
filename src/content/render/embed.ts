import type { Element, ElementContent, Nodes, Root } from "hast";
import type { Paragraph, Root as MdastRoot } from "mdast";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import { pageHref } from "@/content/links/page-href";
import { resolveEmbed } from "@/content/links/resolve";
import { renderImageEmbed } from "./links";
import type { RenderContext } from "./pipeline";
import { unavailableMarker } from "./unavailable";
import type { TrustedLink } from "./wikilink";
import type { Wikilink } from "./wikilink-syntax";
import { EMBED_BUDGET_COPY, EMBED_CYCLE_COPY, EMBED_DEPTH_COPY } from "./wikilink-copy";

/**
 * Note embeds (US-083, FR-027, TR-018 as amended by R-6; SA-MOD Rendering pipeline Amendment 2026-09-30 S6-A1, S6-A3).
 *
 * **One render pass (W6-3).** `![[Note]]` is expanded by the `wikilink` handler INSIDE the one `mdastToHast` call:
 * the embedded page's frozen mdast is converted to hast through the `remark-rehype` converter (`convertNote`, the same
 * handlers) and spliced in as children of the embed wrapper. Only that mdast -> hast stage is nested. `rehype-raw`, the
 * strip step, every trusted step and the sanitiser then run ONCE over the whole tree, so they see the host and every
 * embedded note together: one Shiki budget (`file.data.highlightBudget`), one Mermaid id counter, one sanitiser pass.
 * `page.ast` is never mutated (it is shared); the embed is built from a read of it.
 *
 * **Guards (TR-018, R-6).** Per embed, in this order: an unavailable target takes the shared marker; a page already in
 * the chain (`ctx.visited`, a NEW set per step, never shared across siblings) takes the cycle marker; a chain already
 * `EMBED_DEPTH_CAP` pages long (host included, TC-218) takes the depth marker; an exhausted `ctx.budget` (ONE object
 * per top-level render, `EMBED_BUDGET` expansions in total) takes the budget marker. A resolved expansion takes 1;
 * markers, unavailable targets and image embeds take nothing. Recursion depth is therefore at most
 * `EMBED_DEPTH_CAP` and total work at most `EMBED_BUDGET` expansions.
 *
 * **Structure.** An expansion is `div.note-embed` holding the body only: the `yaml` node emits nothing, so there is no
 * frontmatter and no derived title. A limit marker is one block `div.embed-marker` with the accepted copy and nothing
 * else (no name, no path). Because a block cannot live in a `<p>`, `paragraphHandler` splits a paragraph around a block
 * embed. An embed expands only as (or split out of) a paragraph, including one in a list item, blockquote or callout,
 * and in a table cell; elsewhere it degrades to a link or the marker (`renderEmbed`).
 *
 * **Trust.** The wrapper must have its children parsed by `rehype-raw` (embedded notes can hold raw HTML), so it cannot
 * be a passthrough node. It is an ordinary `div` carrying an unguessable per-render `dataEmbedNonce`; `rehypeNoteEmbeds`
 * (after `rehypeStripAuthorAttrs`) recognises it by that value, sets the reserved class and removes the nonce. An
 * author-written `data-embed-nonce` cannot match and is removed. Markers ARE passthrough `trustedLink` nodes.
 *
 * **Ids (W6-4, TC-450).** See `rehypeNoteEmbeds` and `unique-ids.ts`.
 */
export const EMBED_BUDGET = 100;
export const EMBED_DEPTH_CAP = 10;
export const EMBED_CLASS = "note-embed";
export const EMBED_MARKER_CLASS = "embed-marker";
/** Every class this module emits (the schema and `rehypeStripAuthorAttrs` both derive from this one list). */
export const EMBED_CLASS_TOKENS: readonly string[] = [EMBED_CLASS, EMBED_MARKER_CLASS];
export const EMBED_NONCE_PROPERTY = "dataEmbedNonce";

/** What the pipeline puts on the `VFile` so the handlers can expand a note without importing the pipeline. */
export interface EmbedRuntime {
  nonce: string;
  /** mdast -> hast for one embedded note, through the same `remark-rehype` handlers. */
  convertNote(tree: MdastRoot, file: object): Root;
}

type Handler = NonNullable<NonNullable<RemarkRehypeOptions["handlers"]>["yaml"]>;
type State = Parameters<Handler>[0];
type HastChild = ElementContent;

function embedRuntimeOf(file: { data: object }): EmbedRuntime | undefined {
  return (file.data as { embedRuntime?: EmbedRuntime }).embedRuntime;
}

/**
 * A target that names a non-Markdown file (`x.png`, `doc.pdf`): an attachment, taken by the image path (`links.ts`,
 * US-084, W7-4: an image becomes an `img`, anything else or nothing there becomes the image marker). This is only a
 * fallback AFTER note resolution (`renderEmbed` resolves as a note first), so a note whose name contains a dot-word
 * (`my.note.md`) is still embedded. The extension must start with a letter, so `Release 1.5` is never an attachment.
 */
export function looksLikeAttachment(target: string): boolean {
  const match = /\.([A-Za-z][A-Za-z0-9]{0,7})$/.exec(target.trim());
  return match !== null && match[1]!.toLowerCase() !== "md";
}

function trusted(element: Element): TrustedLink {
  return { type: "trustedLink", element };
}

function limitMarker(copy: string): TrustedLink {
  return trusted({
    type: "element",
    tagName: "div",
    properties: { className: [EMBED_MARKER_CLASS] },
    children: [{ type: "text", value: copy }],
  });
}

export interface EmbedOutput {
  /** True for a block (an expansion or a limit marker); false for text or the inline unavailable marker. */
  block: boolean;
  node: Nodes;
}

function childFile(file: { data: object }, ctx: RenderContext): object {
  const child = Object.create(file) as { data: object; path?: string };
  child.data = { ...file.data, renderContext: ctx };
  return child;
}

/**
 * Renders one embed wikilink (`node.embed`) per the guards above.
 *
 * `expand` is true only where a block is valid: the embed is, or is split out of, a paragraph, or sits in a table cell.
 * Anywhere else (a heading, emphasis, strong, delete, a link, any other phrasing container) the embed DEGRADES so the
 * output stays well-formed: a resolved note becomes the plain `a.wikilink` to that note with the embed text, a missing
 * or ambiguous target the W6-1 marker. A degraded embed takes nothing from the budget.
 *
 * Order: resolve as a note first; only when that fails does a non-`.md` extension take the image path (US-084, W7-4: an
 * `img`, or the image marker), and otherwise it is a missing note and gets the link marker.
 */
export function renderEmbed(node: Wikilink, ctx: RenderContext, file: { data: object }, expand: boolean): EmbedOutput {
  const literal = (): EmbedOutput => ({ block: false, node: { type: "text", value: node.raw } });
  const runtime = embedRuntimeOf(file);
  if (!runtime) return literal();

  const resolved = resolveEmbed(ctx.linkMap, { kind: "embed-note", text: node.target });
  if (resolved.kind !== "page") {
    if (looksLikeAttachment(node.target)) return { block: false, node: renderImageEmbed(node, ctx, runtime.nonce) as never };
    return { block: false, node: trusted(unavailableMarker(node.value)) as never };
  }
  const path = resolved.path;
  if (!expand) {
    const link: Element = {
      type: "element",
      tagName: "a",
      properties: { href: pageHref(ctx.linkMap.wikiId, path), className: ["wikilink"] },
      children: [{ type: "text", value: node.value }],
    };
    return { block: false, node: trusted(link) as never };
  }
  if (ctx.visited.has(path)) return { block: true, node: limitMarker(EMBED_CYCLE_COPY) as never };
  if (ctx.depth + 1 >= EMBED_DEPTH_CAP) return { block: true, node: limitMarker(EMBED_DEPTH_COPY) as never };
  if (ctx.budget.remaining <= 0) return { block: true, node: limitMarker(EMBED_BUDGET_COPY) as never };
  const ast = ctx.pageAst(path);
  if (!ast) return { block: false, node: trusted(unavailableMarker(node.value)) as never };

  ctx.budget.remaining -= 1;
  const childCtx: RenderContext = { ...ctx, currentPath: path, visited: new Set([...ctx.visited, path]), depth: ctx.depth + 1 };
  const body = runtime.convertNote(ast, childFile(file, childCtx));
  const wrapper: Element = {
    type: "element",
    tagName: "div",
    properties: { [EMBED_NONCE_PROPERTY]: runtime.nonce },
    children: body.children as HastChild[],
  };
  return { block: true, node: wrapper };
}

function isEmbed(node: { type: string }): node is Wikilink {
  return node.type === "wikilink" && (node as Wikilink).embed === true;
}

/**
 * The `paragraph` handler. Without an embed it is the default (`p` of the inline content). With one, each block embed
 * ends the current `p` and stands between paragraphs, so no `div` is ever parsed inside a `p` (which `rehype-raw` would
 * otherwise repair by splitting the paragraph). Inline embed outputs (literal text, the unavailable marker) stay in the
 * paragraph. The embeds are expanded here in document order, which is what the budget is counted in.
 */
export const paragraphHandler: Handler = (state: State, mdastNode) => {
  const node = mdastNode as Paragraph;
  if (!node.children.some(isEmbed)) {
    const result: Element = { type: "element", tagName: "p", properties: {}, children: state.all(node) as HastChild[] };
    state.patch(node, result);
    return state.applyData(node, result);
  }
  const file = state.options.file as unknown as { data: object };
  const ctx = (file.data as { renderContext?: RenderContext }).renderContext;
  const out: Nodes[] = [];
  let current: HastChild[] = [];
  const flush = (): void => {
    if (current.some((c) => !(c.type === "text" && c.value.trim() === ""))) {
      out.push({ type: "element", tagName: "p", properties: {}, children: current });
    }
    current = [];
  };
  let run: Paragraph["children"] = [];
  const flushRun = (): void => {
    if (run.length > 0) current.push(...(state.all({ type: "paragraph", children: run }) as HastChild[]));
    run = [];
  };
  // Raw HTML in the paragraph (`html` nodes: `<em>`, `<b>`, `<span>`, `<a>`, `<br>`, ...) may open a phrasing element around
  // an embed, and a block there is repaired by `rehype-raw`. Tags are not tracked: ANY raw `html` child makes every embed
  // in this paragraph degrade (link or marker, no budget), the same as inside emphasis. A sound rule over a clever one.
  const hasRawHtml = node.children.some((c) => c.type === "html");
  for (const child of node.children) {
    if (!isEmbed(child) || !ctx) {
      run.push(child);
      continue;
    }
    flushRun();
    const result = renderEmbed(child, ctx, file, !hasRawHtml);
    if (result.block) {
      flush();
      out.push(result.node);
    } else {
      current.push(result.node as HastChild);
    }
  }
  flushRun();
  flush();
  return out as never;
};

function isWrapper(node: Element, nonce: string | undefined): boolean {
  return nonce !== undefined && node.properties?.[EMBED_NONCE_PROPERTY] === nonce;
}

/** Applies a function to the elements of a subtree, not descending into a nested embed wrapper. */
function eachScoped(root: Element, nonce: string | undefined, fn: (el: Element) => void): void {
  const walk = (el: Element): void => {
    for (const child of el.children) {
      if (child.type !== "element") continue;
      if (isWrapper(child, nonce)) continue;
      fn(child);
      walk(child);
    }
  };
  walk(root);
}

function tokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

/**
 * Turns each nonce-carrying wrapper into `div.note-embed` and gives the element ids inside it their own namespace.
 * Runs straight after `rehypeTrustedLinks`, so after `rehypeStripAuthorAttrs` (the nonce is not in the reserved list, so
 * the wrapper reaches here; an author cannot forge the value) and before `rehypePrefixFragmentLinks` and the sanitiser.
 *
 * **Id scheme (W6-4, TC-450).** Wrappers are numbered 1, 2, ... in document order, per render. Inside wrapper `n`
 * (excluding nested wrappers, which have their own number) every `id` becomes `embed-<n>-<id>`, every same-page `#href`
 * to one of those ids is rewritten to match, and so is every `aria-describedby` / `aria-labelledby` token. The sanitiser
 * then adds its `user-content-` prefix to ids, and `rehypePrefixFragmentLinks` to the hrefs, as for any page. The id
 * families found: heading ids (parse-time slugs, `data.hProperties.id`), GFM footnotes (`fn-<label>` and
 * `fnref-<label>[-k]`, plus the `footnote-label` heading that `aria-describedby` on the references points at), and ids
 * an author writes in raw HTML. Mermaid placeholder ids are not `id` attributes (`data-mermaid-id`); they come from
 * `mermaidBlockId(path, index)` with one index counter over the whole tree, so they are already unique. Whatever is
 * left (an author id in the host that equals a generated one) is caught by `rehypeUniqueIds`.
 */
export function rehypeNoteEmbeds() {
  return (tree: Root, file: { data: object }): void => {
    const nonce = embedRuntimeOf(file)?.nonce;
    let counter = 0;
    const visit = (parent: Root | Element): void => {
      for (const child of parent.children) {
        if (child.type !== "element") continue;
        if (isWrapper(child, nonce)) {
          const n = ++counter;
          scopeIds(child, n, nonce);
          delete child.properties[EMBED_NONCE_PROPERTY];
          child.properties.className = [EMBED_CLASS];
        } else if (child.properties && EMBED_NONCE_PROPERTY in child.properties) {
          delete child.properties[EMBED_NONCE_PROPERTY];
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

function scopeIds(wrapper: Element, n: number, nonce: string | undefined): void {
  const renamed = new Map<string, string>();
  eachScoped(wrapper, nonce, (el) => {
    const id = el.properties?.id;
    if (typeof id === "string" && id !== "") {
      const next = `embed-${n}-${id}`;
      // Two elements of one note with the same id keep the same new id; the final pass separates them.
      renamed.set(id, next);
      el.properties.id = next;
    }
  });
  if (renamed.size === 0) return;
  eachScoped(wrapper, nonce, (el) => {
    const props = el.properties;
    if (!props) return;
    const href = props.href;
    if (typeof href === "string" && href.startsWith("#")) {
      const next = renamed.get(href.slice(1));
      if (next !== undefined) props.href = `#${next}`;
    }
    for (const name of ["ariaDescribedBy", "ariaLabelledBy"] as const) {
      const value = props[name];
      if (value === undefined) continue;
      const mapped = tokens(value).map((t) => renamed.get(t) ?? t);
      props[name] = mapped;
    }
  });
}
