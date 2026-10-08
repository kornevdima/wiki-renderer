/**
 * The reader's document title (US-221, FR-024 amendment, SA-MOD Reader UI and print E3-D9): ONE pure helper.
 * `<screen> · <wiki> · <suffix>` inside the reader shell, `<screen> · <suffix>` outside it. The caller never passes a
 * wiki on a screen a denied viewer can reach (not-found, retry, revoked: SR-020), so the title cannot vary by cause.
 * The suffix is the message `documentTitle.suffix`.
 *
 * The result is a plain string for a React `<title>` child (or a metadata `title`): markup is text there, never an
 * element. Each name is whitespace-collapsed (a newline becomes one space); a "·" inside a name is kept as typed. There is no
 * length cap: the browser shortens a long tab title itself.
 */
export const TITLE_SEPARATOR = " · ";

export interface DocumentTitleInput {
  screen: string;
  /** Present only inside the reader shell. */
  wiki?: string;
  suffix: string;
}

function segment(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function documentTitle({ screen, wiki, suffix }: DocumentTitleInput): string {
  const parts = [segment(screen)];
  const name = wiki === undefined ? "" : segment(wiki);
  if (name !== "") parts.push(name);
  parts.push(suffix);
  return parts.join(TITLE_SEPARATOR);
}
