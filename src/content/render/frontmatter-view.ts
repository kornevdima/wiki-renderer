import type { FrontmatterField, FrontmatterToken } from "./types";
import { splitWikilinks, type Wikilink } from "./wikilink-syntax";

/**
 * Maps `ParsedPage.frontmatter` to the structured `FrontmatterField[]` (US-071, OA-1, FR-023). Pure data in, pure
 * data out: nothing here is ever parsed as markup, so keys and values holding HTML stay inert text (TC-463).
 *
 * - Every top-level key (at most 100, then a `(truncated)` key), in source order, none hidden (`title` and `aliases` included). Duplicate keys were already
 *   resolved by the parser (last wins).
 * - A list stays an array and a map becomes a plain object; scalars and `null` pass through as parsed. The panel
 *   (US-108) owns the "empty" wording for `null`.
 * - Bounds: strings 2,000 characters, lists and maps 100 entries, nesting depth 5. Each cut is marked
 *   `(truncated)`: a string gets it appended, a list gets a trailing `"(truncated)"` item after the 100 kept, a
 *   map gets a `"(truncated)"` key, and a container below depth 5 is replaced by the string `"(truncated)"`.
 * - Wikilinks (US-160): with a `resolveHref` the string values (a scalar, or each string item of a list or map) that hold
 *   `[[...]]` become a `LinkedText` token list, built AFTER the bounds above so a link cut by a bound is plain text. The
 *   resolver is the body's (`resolveWikilinkHref`), so an href can only come from it and an unavailable one carries
 *   none. Keys, plain URLs and every other string stay text. `MAX_LINKS` bounds the resolutions per page.
 * - `MAX_NODES` is a total ceiling over the whole page, so shared YAML aliases (100 x 100 x ... expansion) cannot
 *   bloat a render even inside the per-level bounds. Once it is spent, further values become `"(truncated)"`.
 */
export const MAX_STRING = 2000;
export const MAX_ITEMS = 100;
export const MAX_DEPTH = 5;
export const MAX_NODES = 10_000;
export const TRUNCATED = "(truncated)";
/** Most wikilinks resolved over one page's frontmatter; further ones stay literal text. */
export const MAX_LINKS = 500;

/**
 * A string value that held wikilinks, as tokens. Branded with a `Symbol.for` key (like the repo's other cross-bundle
 * state), which parsed YAML cannot produce, so no author value can pose as one.
 */
const LINKED = Symbol.for("wiki-renderer.content.frontmatterLinkedText");
export interface LinkedText {
  readonly [LINKED]: true;
  readonly tokens: readonly FrontmatterToken[];
}
export function isLinkedText(value: unknown): value is LinkedText {
  return typeof value === "object" && value !== null && (value as Partial<LinkedText>)[LINKED] === true;
}

/** The body resolver's answer for one wikilink: the page href, or `undefined` for the unavailable marker. */
export type ResolveWikilinkHref = (node: Wikilink) => string | undefined;

function tokenise(value: string, resolve: ResolveWikilinkHref, links: { remaining: number }): LinkedText | undefined {
  const parts = splitWikilinks(value);
  if (!parts) return undefined;
  const tokens: FrontmatterToken[] = parts.map((part): FrontmatterToken => {
    if (part.type === "text") return { kind: "text", text: part.value };
    if (--links.remaining < 0) return { kind: "text", text: part.raw };
    const href = resolve(part);
    return href === undefined ? { kind: "unavailable", text: part.value } : { kind: "link", text: part.value, href };
  });
  return { [LINKED]: true, tokens };
}

function link(value: unknown, resolve: ResolveWikilinkHref, links: { remaining: number }): unknown {
  if (typeof value === "string") return tokenise(value, resolve, links) ?? value;
  if (Array.isArray(value)) return value.map((item) => link(item, resolve, links));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      Object.defineProperty(out, k, { value: link(v, resolve, links), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

interface Budget {
  nodes: number;
}

function cutString(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)} ${TRUNCATED}` : value;
}

function bound(value: unknown, depth: number, budget: Budget): unknown {
  if (--budget.nodes < 0) return TRUNCATED;
  if (typeof value === "string") return cutString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth > MAX_DEPTH) return TRUNCATED;
    const out: unknown[] = value.slice(0, MAX_ITEMS).map((item) => bound(item, depth + 1, budget));
    if (value.length > MAX_ITEMS) out.push(TRUNCATED);
    return out;
  }
  if (typeof value === "object" && value !== undefined) {
    if (depth > MAX_DEPTH) return TRUNCATED;
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries.slice(0, MAX_ITEMS)) {
      // defineProperty: a `__proto__` key is data, never a prototype write.
      Object.defineProperty(out, cutString(k), {
        value: bound(v, depth + 1, budget),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (entries.length > MAX_ITEMS) out[TRUNCATED] = TRUNCATED;
    return out;
  }
  // undefined, bigint, function, symbol cannot come from the YAML core schema; render them as nothing.
  return null;
}

export function buildFrontmatterView(frontmatter: Record<string, unknown>, resolveHref?: ResolveWikilinkHref): FrontmatterField[] {
  const budget: Budget = { nodes: MAX_NODES };
  const links = { remaining: MAX_LINKS };
  const entries = Object.entries(frontmatter);
  const fields = entries
    .slice(0, MAX_ITEMS)
    .map(([key, value]) => ({ key: cutString(key), value: bound(value, 1, budget) }))
    .map((field) => (resolveHref ? { ...field, value: link(field.value, resolveHref, links) } : field));
  if (entries.length > MAX_ITEMS) fields.push({ key: TRUNCATED, value: TRUNCATED });
  return fields;
}
