/**
 * The path guard (SA-MOD Link resolution §2, S6-L2; SR-010; TC-221). Pure string logic: it takes no map and performs no
 * lookup, so a rejection here happens BEFORE any file lookup by construction (US-085 scenario 4).
 *
 * `guardRelativeTarget(currentPath, target)` turns the `href` or `src` an author wrote into the repository path it
 * names, or refuses. Steps, in order:
 *
 * 1. Cut the fragment (from the first `#`) and the query (from the first `?`). Neither ever reaches a lookup.
 * 2. Percent-decode the path ONCE. A malformed escape refuses. A second decode is never applied, so a double-encoded
 *    `%252e%252e%252f` is refused here: after the one decode it still holds a `%XX` escape, which no real file name
 *    this renderer links to needs (accepted limit, stated in the contract).
 * 3. Refuse an empty path, a leading `/` (absolute), a backslash, NUL and every other C0 control character (and DEL),
 *    and a path longer than 1,024 bytes. These are the page route's A1 rules.
 * 4. Resolve `.` and `..` against the folder of `currentPath`, segment by segment. A `..` that stays inside the
 *    repository resolves (this vault's own links climb to the repository root); a `..` with nothing left to climb
 *    refuses. This is THE root check (R3's mutation pin).
 *
 * A refusal carries no reason: every caller renders the same marker for every refusal (SR-020).
 */

/** Longest accepted path, in UTF-8 bytes (the page route's A1 rule). */
export const MAX_GUARDED_PATH_BYTES = 1024;

export type GuardedTarget = { ok: true; path: string; fragment: string | undefined } | { ok: false };

const REFUSED: GuardedTarget = { ok: false };

/** C0 controls (U+0000..U+001F) and DEL. */
function hasControl(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function decodeOnce(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

/** The fragment of a target, once-decoded (a malformed escape leaves the raw text), or undefined when there is none. */
function fragmentOf(target: string): string | undefined {
  const hash = target.indexOf("#");
  if (hash < 0) return undefined;
  const raw = target.slice(hash + 1);
  return decodeOnce(raw) ?? raw;
}

function folderOf(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts.filter((part) => part !== "");
}

export function guardRelativeTarget(currentPath: string, target: string): GuardedTarget {
  const fragment = fragmentOf(target);
  const beforeFragment = target.indexOf("#") < 0 ? target : target.slice(0, target.indexOf("#"));
  const query = beforeFragment.indexOf("?");
  const rawPath = query < 0 ? beforeFragment : beforeFragment.slice(0, query);

  const path = decodeOnce(rawPath);
  if (path === undefined || path === "") return REFUSED;
  if (path.startsWith("/") || path.includes("\\") || hasControl(path)) return REFUSED;
  // Double encoding: one decode has been applied, and another escape is still standing.
  if (/%[0-9A-Fa-f]{2}/.test(path)) return REFUSED;
  if (Buffer.byteLength(path, "utf8") > MAX_GUARDED_PATH_BYTES) return REFUSED;

  const stack = folderOf(currentPath);
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return REFUSED;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  if (stack.length === 0) return REFUSED;
  return { ok: true, path: stack.join("/"), fragment };
}

/**
 * The scheme of an href the way a browser reads it: leading C0 controls and spaces are dropped and tab, LF and CR are
 * removed anywhere, so `" JaVa\tScript:x"` is `"javascript"`. `undefined` when there is no scheme.
 */
export function hrefScheme(href: string): string | undefined {
  const cleaned = cleanHref(href);
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  return match ? match[1]!.toLowerCase() : undefined;
}

/** The href as a browser's URL parser sees its start: no leading C0 controls or spaces, no tab, LF or CR. */
export function cleanHref(href: string): string {
  // eslint-disable-next-line no-control-regex
  return href.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
}

/** True for `//host/x`, and for the backslash spellings a browser also reads as two slashes (`\\host`, `/\host`). */
export function isProtocolRelative(href: string): boolean {
  return /^[\\/]{2}/.test(cleanHref(href));
}
