import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot } from "hast";
import type { LinkMap } from "@/content/links/types";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { rehypeCallouts } from "./callouts";
import { HIGHLIGHT_BUDGET_CHARS } from "./highlighter";
import { rehypeFocusableTables } from "./focusable-tables";
import { rehypeHighlight } from "./highlight-step";
import { paragraphHandler, rehypeNoteEmbeds, EMBED_BUDGET, type EmbedRuntime } from "./embed";
import { linkHandlers, rehypeLinks } from "./links";
import { rehypeHeadingAnchors } from "./heading-anchors";
import { rehypeUniqueIds } from "./unique-ids";
import { rehypeMermaidPlaceholder } from "./mermaid-placeholder";
import { rehypePrefixFragmentLinks, sanitizeSchema } from "./sanitize-schema";
import { rehypeTaskLabels } from "./task-labels";
import { rehypeStripAuthorAttrs } from "./strip-author-attrs";
import { recogniseWikilinks } from "./wikilink-syntax";
import { rehypeTrustedLinks, TRUSTED_NODE_TYPES, wikilinkHandler } from "./wikilink";

/**
 * `unified()` chain assembly shared by `parse.ts` and `render.ts` (SA-MOD Rendering pipeline §2).
 *
 * `parseMarkdown` is THE ONE function in the codebase that turns Markdown text into mdast (BR-036). `parsePages`
 * calls it once per file; `renderPage` never calls it. The parse-count spec spies on exactly this export.
 *
 * Front matter: `remark-frontmatter` is configured for the YAML matter only (ADR-008 amendment 2026-09-29), so
 * `---js`, `+++` and any other fence is ordinary Markdown text and nothing executes repository content.
 */
const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm);

export function parseMarkdown(text: string): MdastRoot {
  const tree = parser.parse(text);
  // The hand-rolled `[[...]]` recogniser (ADR-009), run once here so it is part of the one parse and of the frozen AST.
  recogniseWikilinks(tree);
  return tree;
}

/**
 * mdast -> sanitised hast (contract X1): `remark-rehype` (raw HTML kept as `raw` nodes) -> `rehype-raw` (parses
 * them into elements; the trusted `wikilink` output passes through) -> `rehypeStripAuthorAttrs` (author-written reserved
 * attributes removed) -> `rehypeTrustedLinks` (unwraps the resolved wikilinks, `wikilink.ts`) -> callouts
 * -> note embeds (wrapper class and per-embed id namespace, `embed.ts`) -> links and images (external treatment, raw
 * HTML `a` / `img`, `links.ts`; Markdown links and images were resolved by the `remark-rehype` handlers) -> callouts
 * (trusted) -> Mermaid placeholders (trusted) -> Shiki (trusted, only when the highlighter is primed) -> focusable tables and `pre` (trusted, `tabIndex` 0, US-189) -> task-checkbox labels (trusted, US-189) -> unique ids -> heading anchors (trusted, h2 and h3 only, US-219) -> fragment-link prefixing -> `rehype-sanitize` LAST. Nothing runs after the sanitiser except
 * the JSX conversion in `render.ts`. The pieces land together: `rehype-raw` without the sanitiser lets `<script>`
 * and `onerror` through. The `yaml` node has no visible rendering (the panel is US-071), so its handler emits
 * nothing. `remark-rehype`'s `clobberPrefix` is empty: the sanitiser owns the `CLOBBER_PREFIX` on ids and
 * `rehypePrefixFragmentLinks` applies the same prefix to `#fragment` hrefs (see `sanitize-schema.ts`).
 */
const REMARK_REHYPE_OPTIONS = {
  allowDangerousHtml: true,
  clobberPrefix: "",
  handlers: { yaml: () => undefined, wikilink: wikilinkHandler, paragraph: paragraphHandler, ...linkHandlers },
} as RemarkRehypeOptions;

/**
 * The mdast -> hast stage alone, for one embedded note (`embed.ts`, W6-3): the same options and handlers as the main
 * chain below, nothing after it. Everything later in the chain runs once over the assembled tree.
 */
const noteToHast = unified().use(remarkRehype, REMARK_REHYPE_OPTIONS);

const toHast = unified()
  .use(remarkRehype, REMARK_REHYPE_OPTIONS)
  .use(rehypeRaw, { passThrough: TRUSTED_NODE_TYPES })
  .use(rehypeStripAuthorAttrs)
  .use(rehypeTrustedLinks)
  .use(rehypeNoteEmbeds)
  .use(rehypeLinks)
  .use(rehypeCallouts)
  .use(rehypeMermaidPlaceholder)
  .use(rehypeHighlight)
  .use(rehypeFocusableTables)
  .use(rehypeTaskLabels)
  .use(rehypeUniqueIds)
  .use(rehypeHeadingAnchors)
  .use(rehypePrefixFragmentLinks)
  .use(rehypeSanitize, sanitizeSchema);

/**
 * The per-render context (Amendment 2026-09-30, S6-A1). It reaches the plugins and the `remark-rehype` handlers on the
 * `VFile` (`file.path`, `file.data.renderContext`; handlers see it as `state.options.file`), so the processor stays a
 * shared singleton and nothing about a page lives in module state. A later wave adds the asset prefix.
 *
 * `pageAst` is how an embed reads the target page's frozen mdast (read only, never mutated); `visited`, `depth` and
 * `budget` are the embed guards (`embed.ts`): `visited` is a new set per step, `budget` one object per top-level render.
 */
export interface RenderContext {
  currentPath: string;
  linkMap: LinkMap;
  pageAst: (path: string) => MdastRoot | undefined;
  visited: ReadonlySet<string>;
  depth: number;
  budget: { remaining: number };
}

/** A fresh top-level context: the chain holds only the page itself, depth 0, the full embed budget. */
export function createRenderContext(
  currentPath: string,
  linkMap: LinkMap,
  pageAst: (path: string) => MdastRoot | undefined,
): RenderContext {
  return { currentPath, linkMap, pageAst, visited: new Set([currentPath]), depth: 0, budget: { remaining: EMBED_BUDGET } };
}

export function mdastToHast(tree: MdastRoot, ctx: RenderContext): HastRoot {
  const embedRuntime: EmbedRuntime = {
    // Unguessable and never output: `rehypeNoteEmbeds` removes it, so nothing an author writes can carry it.
    nonce: crypto.randomUUID(),
    convertNote: (note, file) => noteToHast.runSync(note, file as never) as HastRoot,
  };
  return toHast.runSync(tree, {
    path: ctx.currentPath,
    data: { renderContext: ctx, highlightBudget: { remaining: HIGHLIGHT_BUDGET_CHARS }, embedRuntime },
  }) as HastRoot;
}
