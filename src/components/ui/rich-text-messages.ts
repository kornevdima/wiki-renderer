import type * as React from "react"

/**
 * Every word the RichTextEditor shows: its toolbar, its image and link dialogs. English defaults here; an app passes its own
 * catalogue's strings through `messages` (any subset). MDXEditor's own remaining controls (the table cell menu, the code
 * block's language list) take MDXEditor's `translation`.
 */
export interface RichTextMessages {
  toolbar: string
  undo: string
  redo: string
  textStyle: string
  paragraph: string
  heading: (level: number) => string
  quote: string
  bold: string
  italic: string
  strikethrough: string
  inlineCode: string
  bulletedList: string
  numberedList: string
  checklist: string
  link: string
  image: string
  table: string
  codeBlock: string
  rule: string
  addProperties: string
  editProperties: string
  view: string
  richText: string
  source: string
  changes: string

  imageNewTitle: string
  imageEditTitle: string
  imageFile: string
  /** The drop zone's title; mark the browse word with `<u>`. */
  imageDrop: React.ReactNode
  /** Accepted types and size limit, in words. */
  imageHint: string
  imageAddress: string
  imageAddressHint: string
  imageAlt: string
  imageAltHint: string
  imageTitle: string
  imageMissing: string
  imageUploadFailed: string
  imageEdit: string
  imageRemove: string
  insert: string
  save: string
  cancel: string
  close: string
  optional: string

  linkNewTitle: string
  linkEditTitle: string
  linkAddress: string
  linkText: string
  linkTitle: string
  linkMissing: string
  linkOpen: string
  linkEdit: string
  linkRemove: string
}

export const RICH_TEXT_MESSAGES: RichTextMessages = {
  toolbar: "Formatting",
  undo: "Undo",
  redo: "Redo",
  textStyle: "Text style",
  paragraph: "Paragraph",
  heading: (level) => `Heading ${level}`,
  quote: "Quote",
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
  inlineCode: "Inline code",
  bulletedList: "Bulleted list",
  numberedList: "Numbered list",
  checklist: "Checklist",
  link: "Link",
  image: "Image",
  table: "Table",
  codeBlock: "Code block",
  rule: "Horizontal rule",
  addProperties: "Add properties",
  editProperties: "Edit properties",
  view: "View",
  richText: "Rich text",
  source: "Source",
  changes: "Changes",

  imageNewTitle: "Add image",
  imageEditTitle: "Edit image",
  imageFile: "File",
  imageDrop: "Drop an image here or browse",
  imageHint: "PNG, JPG, GIF, WebP or SVG, up to 10 MB",
  imageAddress: "Image address",
  imageAddressHint: "A web address, or a path in this wiki.",
  imageAlt: "Alt text",
  imageAltHint: "Describe the image for people who can't see it.",
  imageTitle: "Title",
  imageMissing: "Add a file or an image address.",
  imageUploadFailed: "The image couldn't be uploaded. Try again.",
  imageEdit: "Edit image",
  imageRemove: "Remove image",
  insert: "Insert",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
  optional: "optional",

  linkNewTitle: "Add link",
  linkEditTitle: "Edit link",
  linkAddress: "Address",
  linkText: "Text",
  linkTitle: "Title",
  linkMissing: "Enter an address.",
  linkOpen: "Open link",
  linkEdit: "Edit link",
  linkRemove: "Remove link",
}
