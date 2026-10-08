import type { Nodes, Root as MdastRoot } from "mdast";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import type { FileEntry } from "@/content/runtime/types";
import { isMarkdownPath } from "@/content/paths";
import { parseMarkdown } from "./pipeline";
import { sanitizeSchema } from "./sanitize-schema";
import { createSlugger } from "./slugify";
import type { HeadingEntry, ParsedPage } from "./types";

const decoder = new TextDecoder("utf-8");
const SECTION_MARK = "\u001e";

function filenameStem(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Plain data parse of the `yaml` node's value: core schema, no custom tags. Anything odd yields `{}` (TC-202). */
function readFrontmatter(ast: MdastRoot): Record<string, unknown> {
  const node = ast.children[0];
  if (!node || node.type !== "yaml") return {};
  try {
    const value: unknown = parseYaml(node.value, {
      schema: "core",
      customTags: [],
      maxAliasCount: 100,
      // A duplicate key is not malformed: the last one wins (US-071 F1). `uniqueKeys` defaults to true and would
      // turn the whole block into a parse error, hiding every other field.
      uniqueKeys: false,
      logLevel: "error",
    });
    return isPlainObject(value) ? value : {};
  } catch {
    return {};
  }
}

function readTitle(frontmatter: Record<string, unknown>, path: string): string {
  const candidate = frontmatter.title;
  if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  return filenameStem(path);
}

function readAliases(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.aliases;
  const entries = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  return entries
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
}

/**
 * Elements the sanitiser strips WITH their content, read from the one schema so the two cannot drift. `embed` is a void
 * element (no content, no closing tag), so it never opens a hidden span.
 */
const HIDDEN_ELEMENTS = (sanitizeSchema.strip ?? []).filter((tag) => tag !== "embed");
const hiddenAlternatives = HIDDEN_ELEMENTS.map((tag) => tag.replace(/[^a-z0-9]/gi, "")).join("|");
const RAW_TEXT_OPEN = new RegExp(`^<(?:${hiddenAlternatives})(?:[\\s/>]|$)`, "i");
const RAW_TEXT_CLOSE = new RegExp(`^</(?:${hiddenAlternatives})(?:[\\s>]|$)`, "i");

/**
 * The text a viewer sees, for the search index only (OA-1, TC-469): `toString` minus inline raw HTML. An inline `html`
 * node (comment, tag) contributes nothing, and the text between an inline stripped-element pair (`script`, `style`, `noscript`,
 * `svg`, ...) is dropped, as the sanitiser drops it. Headings keep `toString` for `HeadingEntry.text` (the slug source, TR-019); only the `rawText`
 * line uses this.
 */
function visibleText(node: Nodes): string {
  let out = "";
  let hidden = 0;
  const walk = (n: Nodes): void => {
    if (n.type === "html") {
      if (RAW_TEXT_OPEN.test(n.value) && !n.value.endsWith("/>")) hidden += 1;
      else if (RAW_TEXT_CLOSE.test(n.value) && hidden > 0) hidden -= 1;
      return;
    }
    if (hidden > 0) return;
    if ("children" in n) for (const c of n.children) walk(c as Nodes);
    else out += toString(n);
  };
  walk(node);
  return out;
}

/** Headings (slugged, de-duplicated) and the section-tagged plain text, in one walk of the tree. */
function readStructure(ast: MdastRoot): { headings: HeadingEntry[]; rawText: string } {
  const slugFor = createSlugger();
  const headings: HeadingEntry[] = [];
  const sections: { slug: string; lines: string[] }[] = [{ slug: "", lines: [] }];

  visit(ast, (node) => {
    if (node.type === "heading") {
      const text = toString(node);
      const slug = slugFor(text);
      headings.push(Object.freeze({ depth: node.depth, text, slug }));
      // remark-rehype copies `data.hProperties` onto the element: the render-time id IS this parse-time slug.
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: slug } };
      sections.push({ slug, lines: [visibleText(node).replace(/\s+/g, " ")] });
    } else if (node.type === "paragraph" || node.type === "code" || node.type === "tableCell") {
      const text = node.type === "code" ? node.value : visibleText(node);
      if (text !== "") sections[sections.length - 1]!.lines.push(text);
    }
  });

  const rawText = sections
    .filter((s) => s.slug !== "" || s.lines.length > 0)
    .map((s) => `${SECTION_MARK}${s.slug}\n${s.lines.join("\n").replaceAll(SECTION_MARK, "")}`)
    .join("\n");
  // BR-036: the parse output is shared by render, links and search, so it is immutable from here on.
  return { headings: Object.freeze(headings) as HeadingEntry[], rawText };
}

/**
 * The one parse per `(wiki, sha)` (TR-011, BR-036): one `ParsedPage` per Markdown file; other entries are skipped.
 * Never throws on hostile content.
 */
export function parsePages(files: Map<string, FileEntry>): Map<string, ParsedPage> {
  const pages = new Map<string, ParsedPage>();
  for (const [path, entry] of files) {
    if (!isMarkdownPath(path)) continue;
    const ast = parseMarkdown(decoder.decode(entry.bytes));
    const frontmatter = readFrontmatter(ast);
    const { headings, rawText } = readStructure(ast);
    pages.set(path, {
      path,
      frontmatter,
      title: readTitle(frontmatter, path),
      aliases: readAliases(frontmatter),
      headings,
      ast,
      rawText,
    });
  }
  return pages;
}
