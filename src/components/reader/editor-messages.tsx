import { getTranslations } from "next-intl/server";

import type { EditorCopy } from "./edit-text";

/** The RichTextEditor's words from the `editor` catalogue, for the server page to hand to the client editor. */
export async function editorCopy(): Promise<EditorCopy> {
  const t = await getTranslations("editor");
  const keys = [
    "toolbar", "undo", "redo", "textStyle", "paragraph", "quote", "bold", "italic", "strikethrough", "inlineCode",
    "bulletedList", "numberedList", "checklist", "link", "image", "table", "codeBlock", "rule", "addProperties",
    "editProperties", "view", "richText", "source", "changes", "imageNewTitle", "imageEditTitle", "imageFile", "imageHint",
    "imageAddress", "imageAddressHint", "imageAlt", "imageAltHint", "imageTitle", "imageMissing", "imageUploadFailed", "imageEdit", "imageRemove",
    "insert", "save", "cancel", "close", "optional", "linkNewTitle", "linkEditTitle", "linkAddress", "linkText", "linkTitle",
    "linkMissing", "linkOpen", "linkEdit", "linkRemove",
  ] as const;
  const words = Object.fromEntries(keys.map((key) => [key, t(key)])) as Record<(typeof keys)[number], string>;
  return {
    ...words,
    imageDrop: t.rich("imageDrop", { u: (chunks) => <u>{chunks}</u> }),
    headingTemplate: t.raw("heading") as string,
  };
}
