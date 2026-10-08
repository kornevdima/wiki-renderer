/**
 * Which frontmatter values are literal text and so are set in Lilex (US-218, Literal Text Rule): a record ID (`US-218`,
 * `FR-024`), a recorded date (`2026-10-07`, or a date-time that starts with one) or a 7 to 40 character commit id (hex with at least one digit and one letter, so `defaced` and `1234567` are not). Every other
 * string, a page title or a sentence for one, stays in the body face. Pure and bounded: three anchored patterns, no backtracking.
 */
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;
const COMMIT = /^(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/;

export function isLiteralValue(value: string): boolean {
  const text = value.trim();
  return ID.test(text) || DATE.test(text) || COMMIT.test(text);
}
