import { slugify } from "@/content/render/slugify";
import { foldName, stripMdExtension } from "./link-map";
import { cleanHref, guardRelativeTarget, hrefScheme, isProtocolRelative } from "./path-guard";
import type { LinkMap, RawLinkTarget, ResolvedTarget } from "./types";

/**
 * Link resolution (SA-MOD Link resolution §3, §5, §6, §8; ADR-009). Pure, stateless, no viewer, no I/O.
 *
 * **Confinement (US-082, BR-037, FR-039):** every function here takes exactly one `LinkMap`, which is built for one
 * `(wikiId, sha)`, and reads only that map. No function takes a second map or a `wikiId`; `resolve-rules.test.ts` pins the
 * exported signatures.
 *
 * - **Path-qualified** (the target contains `/`): `pathIndex` only, exact case, `Note` and `Note.md` both hit
 *   `folder/Note.md`. An exact, un-normalised hit wins; otherwise the NFC key is tried, where one file is the page and
 *   two files differing only by Unicode normalisation are `ambiguous`, never a pick (TR-016). It NEVER falls
 *   back to a basename or alias match (TC-213), so `[[folder-b/Notes]]` cannot land on `folder-a/Notes.md`.
 * - **Bare**: ONE candidate set, the union (de-duplicated by path) of the folded basename index and the alias index
 *   (W5-4). One path is the page, none is `not-found`, more than one is `ambiguous`, never an arbitrary pick (TR-016).
 *   A filename match and an alias match for the same page are therefore not ambiguous, and an alias equal to another
 *   page's basename is. The key is NFC + `toLowerCase()` (`foldName`).
 * - **Heading** (US-077): the slug of the heading text is looked up in the page's `headingIndex` entry. A miss is a
 *   partial match (`matched: false`), never unavailable.
 */

const notFound: ResolvedTarget = { kind: "unavailable", reason: "not-found" };
const ambiguous: ResolvedTarget = { kind: "unavailable", reason: "ambiguous" };

/**
 * The ONE bare-note lookup, shared by a plain wikilink, a note embed and (through the union) an alias: the same
 * ambiguous or case-mismatch input gives the same answer on every syntax path (US-080 scenario 5). `[[Note.md]]` is
 * `[[Note]]` (Obsidian parity); the `.md` is dropped case-insensitively.
 */
export function bareNoteCandidates(linkMap: LinkMap, text: string): readonly string[] {
  const key = foldName(stripMdExtension(text));
  const byName = linkMap.basenameIndexFolded.get(key) ?? [];
  const byAlias = linkMap.aliasIndex.get(key) ?? [];
  if (byAlias.length === 0) return byName;
  return [...new Set([...byName, ...byAlias])];
}

/**
 * Exact-case path lookup (W5-5): an exact, un-normalised hit wins; otherwise the NFC key, where one stored path is the
 * answer and more than one (two files differing only by Unicode normalisation) is `"ambiguous"`, never a pick (TR-016).
 * `wanted` keeps pages and assets apart.
 */
function lookupPath(linkMap: LinkMap, text: string, wanted: "page" | "asset"): string | "ambiguous" | undefined {
  const isWanted = (path: string) => linkMap.headingIndex.has(path) === (wanted === "page");
  const exact = linkMap.pathIndex.get(text);
  if (exact !== undefined && isWanted(exact)) return exact;
  const found = (linkMap.pathIndexNfc.get(text.normalize("NFC")) ?? []).filter(isWanted);
  if (found.length === 0) return undefined;
  return found.length > 1 ? "ambiguous" : found[0];
}

/** Path lookup of a page, with or without its `.md`. */
function pagePathFor(linkMap: LinkMap, text: string): string | "ambiguous" | undefined {
  for (const candidate of text.endsWith(".md") ? [text] : [text, `${text}.md`]) {
    const path = lookupPath(linkMap, candidate, "page");
    if (path !== undefined) return path;
  }
  return undefined;
}

/** The heading part of a page result: the slug, and whether the page has it. No heading given, none reported. */
function headingOf(linkMap: LinkMap, path: string, heading: string | undefined): { heading?: { slug?: string; matched: boolean } } {
  if (heading === undefined || heading.trim() === "") return {};
  const slug = slugify(heading.trim());
  return linkMap.headingIndex.get(path)?.has(slug) ? { heading: { slug, matched: true } } : { heading: { matched: false } };
}

function resolveNote(linkMap: LinkMap, rawText: string, heading: string | undefined): ResolvedTarget {
  const text = rawText.trim();
  if (text === "") return notFound;
  if (text.includes("/")) {
    const path = pagePathFor(linkMap, text);
    if (path === undefined) return notFound;
    return path === "ambiguous" ? ambiguous : { kind: "page", path, ...headingOf(linkMap, path, heading) };
  }
  const candidates = bareNoteCandidates(linkMap, text);
  if (candidates.length === 0) return notFound;
  if (candidates.length > 1) return ambiguous;
  return { kind: "page", path: candidates[0]!, ...headingOf(linkMap, candidates[0]!, heading) };
}

/** Resolves a `wikilink` (`[[...]]`). Embed kinds are `resolveEmbed`'s, asking for one here is `not-found`. */
export function resolveLink(linkMap: LinkMap, raw: RawLinkTarget): ResolvedTarget {
  if (raw.kind !== "wikilink") return notFound;
  return resolveNote(linkMap, raw.text, raw.heading);
}

/**
 * Resolves `[[#Heading]]` against the page being rendered (Amendment S6-L2, OA-4). The result is always a page, the
 * current one: a heading the page does not have is a partial match (`matched: false`), never unavailable.
 */
export function resolveSamePageHeading(linkMap: LinkMap, currentPath: string, heading: string): ResolvedTarget {
  return { kind: "page", path: currentPath, ...headingOf(linkMap, currentPath, heading) };
}

/**
 * Resolves an embed target (W5-6). Resolver only; `embed.ts` renders the result (a note expands, an image is an `img`).
 *
 * - `embed-note`: the same note lookup as a wikilink (`resolveNote`: path-qualified, else the bare candidate set), so
 *   ambiguity and case folding are identical on every syntax path.
 * - `embed-image`: exact case, never folded. A path-qualified target is a `pathIndex` lookup of a NON-page file; a bare
 *   name is `assetBasenameIndex`, where two files of that name are `ambiguous`.
 */
export function resolveEmbed(linkMap: LinkMap, raw: RawLinkTarget): ResolvedTarget {
  if (raw.kind === "wikilink") return notFound;
  if (raw.kind === "embed-note") return resolveNote(linkMap, raw.text, raw.heading);
  const text = raw.text.trim();
  if (text === "") return notFound;
  if (text.includes("/")) {
    const path = lookupPath(linkMap, text, "asset");
    if (path === undefined) return notFound;
    return path === "ambiguous" ? ambiguous : { kind: "asset", path };
  }
  const candidates = linkMap.assetBasenameIndex.get(text) ?? [];
  if (candidates.length === 0) return notFound;
  return candidates.length > 1 ? ambiguous : { kind: "asset", path: candidates[0]! };
}

const traversalRejected: ResolvedTarget = { kind: "unavailable", reason: "traversal-rejected" };

/**
 * Resolves a relative Markdown link or image target against the page being rendered (S6-L2, US-085, W7-2). The path
 * guard runs FIRST, on the fragment-stripped, query-stripped, once-decoded path, and a refusal returns before `linkMap`
 * is touched, so nothing above the repository root, no absolute path and no encoded traversal is ever looked up
 * (TC-221). The resolved path is relative to `currentPath`'s folder, never a basename match (`[x](b.md)` is this
 * folder's `b.md`).
 *
 * - A page (with or without its `.md`) is `page`. A `#fragment` becomes a heading only when the page has that heading
 *   (the raw text as a slug, else its slug); otherwise the link goes to the top of the page (TR-019).
 * - Any other existing file is `asset`: the caller decides, by the one image allowlist, whether it draws.
 * - Nothing there is `not-found`; two files differing only by Unicode normalisation are `ambiguous` (TR-016).
 */
export function resolveRelativeLink(linkMap: LinkMap, currentPath: string, relativePath: string): ResolvedTarget {
  const guarded = guardRelativeTarget(currentPath, relativePath);
  if (!guarded.ok) return traversalRejected;
  const pagePath = pagePathFor(linkMap, guarded.path);
  if (pagePath === "ambiguous") return ambiguous;
  if (pagePath !== undefined) {
    const fragment = guarded.fragment?.trim() ?? "";
    if (fragment === "") return { kind: "page", path: pagePath };
    const slugs = linkMap.headingIndex.get(pagePath);
    const slug = slugs?.has(fragment) ? fragment : slugify(fragment);
    return { kind: "page", path: pagePath, heading: slugs?.has(slug) ? { slug, matched: true } : { matched: false } };
  }
  const assetPath = lookupPath(linkMap, guarded.path, "asset");
  if (assetPath === undefined) return notFound;
  return assetPath === "ambiguous" ? ambiguous : { kind: "asset", path: assetPath };
}

/**
 * Classifies an href that names another origin (SR-006, W7-3, TC-222). `http:`, `https:` and `mailto:` are `external`;
 * every other scheme (`javascript:`, `data:`, `vbscript:`, mixed case, leading whitespace, embedded tab or newline) is
 * `blocked` and never becomes an href. A protocol-relative `//host/x`, or its backslash spelling, is EXTERNAL, never
 * internal: its href is returned as `https://host/x`, so the one scheme check and the new-tab treatment apply to it too.
 * The returned `href` of an `external` is the cleaned string a browser would parse, with its scheme lower-cased.
 */
export function resolveExternalLink(href: string): { kind: "external"; href: string } | { kind: "blocked"; href: string } {
  if (isProtocolRelative(href)) return { kind: "external", href: `https://${cleanHref(href).replace(/^[\\/]{2}/, "")}` };
  const scheme = hrefScheme(href);
  // The scheme is emitted lower-cased: the sanitiser's protocol check is case-sensitive, so `HTTPS://x` would lose its href.
  if (scheme === "http" || scheme === "https" || scheme === "mailto") return { kind: "external", href: scheme + cleanHref(href).slice(scheme.length) };
  return { kind: "blocked", href };
}
