import type { Root as MdastRoot } from "mdast";
import type { ReactNode } from "react";

/**
 * Rendering pipeline public types (SA-MOD Rendering pipeline §3). Pure types: no runtime, no imports from
 * `@/features/*` or `@/app/*`.
 */

export interface HeadingEntry {
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** Plain text of the heading (no markup). */
  text: string;
  /** Slug from `slugify`, de-duplicated per page (`-1`, `-2`); identical to the id rendered on the element (TR-019). */
  slug: string;
}

export interface ParsedPage {
  path: string;
  /** Raw front matter mapping, `{}` when absent, malformed or not a mapping (TC-202). */
  frontmatter: Record<string, unknown>;
  /** `frontmatter.title` when a non-empty string after trimming, else the filename stem (FR-024). Plain text. */
  title: string;
  /** String entries of `frontmatter.aliases`, trimmed, lowercased, empties dropped (FR-036). */
  aliases: string[];
  headings: HeadingEntry[];
  /** mdast root (GFM + frontmatter). Shared, never mutated after `parsePages`. Heading nodes carry their slug in
   *  `data.hProperties.id` so the render step emits the parse-time ids. */
  ast: MdastRoot;
  /**
   * Flattened plain text for the future search index. Sections are concatenated; each section is
   * `"\u001e" + slug + "\n" + text lines joined by "\n"`. The first section (text before any heading) has an
   * empty slug. A section's first text line is its heading text. `\u001e` never occurs inside the text (stripped).
   */
  rawText: string;
}

export interface FrontmatterField {
  key: string;
  value: unknown;
}

/** One piece of a frontmatter string value that held wikilinks (US-160). Text only: no markup, no embed. */
export type FrontmatterToken =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "unavailable"; text: string };

export interface MermaidBlock {
  id: string;
  source: string;
}

/**
 * One entry of the "On this page" list (US-219, FR-053). `id` is the FINAL element id (`user-content-…`, any `-dup-k` rename
 * included), `text` the heading's plain text. Flat and in document order; the reader groups an h3 under its h2.
 */
export interface OutlineEntry {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface RenderedPage {
  path: string;
  title: string;
  /** Every top-level frontmatter key in source order, bounded and inert (US-071, `frontmatter-view.ts`). */
  frontmatterView: FrontmatterField[];
  /** The whole body (the page's h1, when it opens with one, included), as before US-220. */
  content: ReactNode;
  /**
   * US-220: when the body opens with its own level-1 heading, that heading alone, so the page can put the meta line after it;
   * otherwise `null`. `leadHeading` followed by `body` is `content`, split once and never converted twice.
   */
  leadHeading: ReactNode | null;
  /** The body after `leadHeading`; equal to `content` when `leadHeading` is `null`. */
  body: ReactNode;
  headings: HeadingEntry[];
  /**
   * US-219: the page's own h2 and h3 headings that carry a copy anchor, read from the final sanitised hast (`collectOutline`),
   * never from the parse-time `headings`. Embedded notes' headings, the footnotes heading and raw-HTML headings without an id
   * are not in it.
   */
  outline: OutlineEntry[];
  /** One entry per Mermaid placeholder in the output, in document order (US-086). */
  mermaidBlocks: MermaidBlock[];
}
