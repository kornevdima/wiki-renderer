import type { RichTextMessages } from "@/components/ui/rich-text-messages";

/**
 * The page's text as the editor and the save's merge see it: no byte-order mark, LF line endings. `savePage` hands the
 * merge the file in the same form and puts the file's own BOM and line endings back when it writes.
 */
export function toEditorText(text: string): string {
  return (text.startsWith("\uFEFF") ? text.slice(1) : text).replace(/\r\n/g, "\n");
}

/**
 * The wiki path an image address in a page points to, for the editor's preview: a relative address resolves against the
 * page's folder. An address with a scheme (`https:`, `data:`), an absolute or fragment address, or one that climbs out of
 * the wiki gives null (the editor then loads it as is).
 */
export function wikiPathOfImage(pagePath: string, src: string): string | null {
  if (src === "" || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.startsWith("#")) return null;
  let decoded: string;
  try {
    decoded = decodeURI(src.split(/[?#]/)[0]!);
  } catch {
    return null;
  }
  const parts = pagePath.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.length === 0 ? null : parts.join("/");
}

/** The address the editor writes for an uploaded file at `assetPath`: relative to the page's folder. */
export function relativeImageAddress(pagePath: string, assetPath: string): string {
  const from = pagePath.split("/").slice(0, -1);
  const to = assetPath.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
}

/**
 * The editor's words as the server page hands them over: the heading label travels as its template (`Heading {level}`),
 * because a function can't cross into a client component's props.
 */
export type EditorCopy = Omit<RichTextMessages, "heading"> & { headingTemplate: string };

/** The template back into `heading(level)`, on the client. */
export function editorMessages({ headingTemplate, ...words }: EditorCopy): RichTextMessages {
  return { ...words, heading: (level) => headingTemplate.replace("{level}", String(level)) };
}
