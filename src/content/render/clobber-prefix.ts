/**
 * The prefix the sanitiser puts on every `id` (and `name`). Its own module so `wikilink.ts` (which writes cross-page
 * heading hrefs) and `sanitize-schema.ts` (which imports `wikilink.ts`) share ONE constant without an import cycle.
 */
export const CLOBBER_PREFIX = "user-content-";
