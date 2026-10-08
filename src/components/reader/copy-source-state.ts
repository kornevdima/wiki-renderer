/** How long "Copied" shows before the button reverts to "Copy" (US-161, D3). */
export const COPIED_REVERT_MS = 2000;

/**
 * Writes `text` to the clipboard (D3). Resolves `true` on success and `false` on any failure: no clipboard API, a
 * refused permission or a rejected write. A failure shows no error UI and logs nothing; the button just stays "Copy".
 */
export async function copyText(
  text: string,
  clipboard: { writeText(text: string): Promise<void> } | undefined,
): Promise<boolean> {
  if (clipboard === undefined) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
