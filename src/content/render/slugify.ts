import GithubSlugger, { slug } from "github-slugger";

/**
 * The one slug algorithm (TR-019): GitHub's heading-anchor rules via `github-slugger` (the algorithm `rehype-slug`
 * uses). Stateless: does not de-duplicate. Used at parse time by `parsePages` and by Link resolution later.
 */
export function slugify(text: string): string {
  return slug(text);
}

/**
 * A per-page de-duplicating slugger: the second `Setup` becomes `setup-1`, the third `setup-2`. Create one per
 * page; call it in document order.
 */
export function createSlugger(): (text: string) => string {
  const slugger = new GithubSlugger();
  return (text) => slugger.slug(text);
}
