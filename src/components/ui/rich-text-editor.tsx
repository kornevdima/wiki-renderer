"use client"

import "@mdxeditor/editor/style.css"
import "./rich-text-editor.css"

import * as React from "react"
import {
  MDXEditor,
  addTopAreaChild$,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  tablePlugin,
  thematicBreakPlugin,
  type IconKey,
  type MDXEditorMethods,
  type RealmPlugin,
  type ToMarkdownOptions,
  type Translation,
  type ViewMode,
} from "@mdxeditor/editor"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Braces,
  Check,
  ChevronDown,
  Code,
  Copy,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  FileCode,
  FileDiff,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Minus,
  Pencil,
  Pilcrow,
  Redo2,
  Settings,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Trash2,
  Underline,
  Undo2,
  Unlink,
  X,
  type LucideIcon,
} from "lucide-react"

import {
  RICH_TEXT_IMAGE_ACCEPT,
  RICH_TEXT_IMAGE_MAX_SIZE,
  RichTextContext,
  type RichTextOptions,
} from "@/components/ui/rich-text-context"
import { RichTextImageDialog, RichTextImageToolbar } from "@/components/ui/rich-text-image-dialog"
import { RichTextLinkDialog } from "@/components/ui/rich-text-link-dialog"
import { RICH_TEXT_MESSAGES, type RichTextMessages } from "@/components/ui/rich-text-messages"
import { RichTextToolbar } from "@/components/ui/rich-text-toolbar"
import { cn } from "@/lib/utils"

/**
 * The design system's RichTextEditor (`project/components/RichTextEditor`, added 2026-10-16 for the local wiki renderer; no
 * website or Figma source): a Markdown editor on MDXEditor (MIT) in the ESG look. Markdown in, Markdown out; the file stays
 * the source of truth.
 *
 * - **Blocks:** headings, paragraphs, bold, italic, strikethrough, inline code, bulleted, numbered and task lists, quotes,
 *   tables, code blocks (CodeMirror), links, images, horizontal rules and YAML frontmatter, plus a rich text / source / changes
 *   switch at the end of the toolbar (the changes view compares against `diffMarkdown`).
 * - **Controls (v49):** the toolbar and the image and link dialogs are ESG components (`rich-text-toolbar.tsx`,
 *   `rich-text-image-dialog.tsx`, `rich-text-link-dialog.tsx`) driven by MDXEditor's public state: 36px icon buttons with
 *   tooltips and a 44px hit area under a coarse pointer, a Select, a SegmentedControl, Dialog, FileUpload and TextField. The
 *   image dialog uploads through `onUploadImage` when the app passes one. Every word is in `messages`.
 * - **Look:** what MDXEditor still draws (the table cell controls, the code block and its language list, the source and
 *   changes views) keeps its own stylesheet with the theme variables remapped to ESG tokens (`rich-text-editor.css`), so it
 *   follows light and dark with the app. Icons are lucide, as everywhere else.
 * - **Markdown out** is written the way the house writes it: `-` bullets, `_emphasis_`, `**strong**`, `---` rules, fenced
 *   code, one-space list indent, unpadded table pipes, and the input is never trimmed (a file keeps its final newline).
 *   `toMarkdownOptions` overrides any of these. A serializer still normalises what it rewrites, so an app that must keep
 *   untouched text byte-identical compares blocks itself before it saves.
 * - **Extensions:** an app adds its own syntax (wikilinks, callouts) through `plugins` and its own buttons through
 *   `toolbarExtra`. The component has no app vocabulary.
 *
 * Client-only: Lexical needs the DOM. Load it with `next/dynamic` and `ssr: false`. All text comes from the caller
 * (`ariaLabel`, `placeholder`, `messages`); MDXEditor's few remaining words take its `translation`.
 */

export type RichTextEditorHandle = MDXEditorMethods
export type RichTextEditorViewMode = ViewMode
export type RichTextEditorPlugin = RealmPlugin

/** The house Markdown style (mdast-util-to-markdown options). */
export const RICH_TEXT_MARKDOWN_OPTIONS: ToMarkdownOptions = {
  bullet: "-",
  emphasis: "_",
  strong: "*",
  rule: "-",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  incrementListMarker: true,
}

/** The wrapper class `rich-text-editor.css` hangs the token remap and the ESG frame on. */
export const RICH_TEXT_EDITOR_CLASS = "esg-rte"
export const RICH_TEXT_CONTENT_CLASS = "esg-rte__content"

const ICONS: Record<IconKey, LucideIcon> = {
  undo: Undo2,
  redo: Redo2,
  format_bold: Bold,
  format_italic: Italic,
  format_underlined: Underline,
  code: Code,
  strikeThrough: Strikethrough,
  superscript: Superscript,
  subscript: Subscript,
  format_list_bulleted: List,
  format_list_numbered: ListOrdered,
  format_list_checked: ListChecks,
  format_highlight: Highlighter,
  link: Link,
  add_photo: ImagePlus,
  table: Table,
  horizontal_rule: Minus,
  frontmatter: Braces,
  frame_source: SquareCode,
  arrow_drop_down: ChevronDown,
  admonition: MessageSquareWarning,
  rich_text: Pilcrow,
  difference: FileDiff,
  markdown: FileCode,
  open_in_new: ExternalLink,
  link_off: Unlink,
  edit: Pencil,
  content_copy: Copy,
  more_horiz: Ellipsis,
  more_vert: EllipsisVertical,
  close: X,
  settings: Settings,
  delete_big: Trash2,
  delete_small: X,
  format_align_center: AlignCenter,
  format_align_left: AlignLeft,
  format_align_right: AlignRight,
  add_row: BetweenHorizontalEnd,
  add_column: BetweenVerticalEnd,
  insert_col_left: ArrowLeftToLine,
  insert_row_above: ArrowUpToLine,
  insert_row_below: ArrowDownToLine,
  insert_col_right: ArrowRightToLine,
  check: Check,
}

/** MDXEditor's icon slot: a lucide icon at the UI icon size, decorative (the button carries the name). */
export function richTextIcon(name: IconKey) {
  const Icon = ICONS[name]
  return <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
}

/** The languages the code block menu offers, as `fence info` → label. An empty key is a plain fence. */
export const RICH_TEXT_CODE_LANGUAGES: Record<string, string> = {
  "": "Plain text",
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  md: "Markdown",
  mermaid: "Mermaid",
  py: "Python",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  yaml: "YAML",
}

type RichTextEditorProps = {
  markdown: string
  onChange?: (markdown: string) => void
  /** The editing area's accessible name ("Edit Getting started"). */
  ariaLabel: string
  placeholder?: React.ReactNode
  /** Shown by the diff view as the "before". Usually the file as it was opened. */
  diffMarkdown?: string
  viewMode?: RichTextEditorViewMode
  /** The app's own syntax, added after the built-in blocks. */
  plugins?: RichTextEditorPlugin[]
  /** The app's own toolbar items, after the built-in groups and before the view switch. */
  toolbarExtra?: React.ReactNode
  codeBlockLanguages?: Record<string, string>
  toMarkdownOptions?: ToMarkdownOptions
  translation?: Translation
  readOnly?: boolean
  autoFocus?: boolean
  /** Classes for the editing area, typically the app's prose class so editing looks like reading. */
  contentEditableClassName?: string
  className?: string
  /** Markdown the parser could not read. The editor then stays empty; offer the source view. */
  onError?: (error: { error: string; source: string }) => void
  /** The toolbar's and dialogs' words (any subset; English by default). */
  messages?: Partial<RichTextMessages>
  /** Uploads a picked image and answers the address to write into the Markdown. Without it, images are added by address. */
  onUploadImage?: (file: File) => Promise<string>
  /** Turns an image address from the Markdown into one the browser can load (a wiki path into the app's asset URL). */
  resolveImageSrc?: (src: string) => string
  imageAccept?: string
  /** Bytes. */
  imageMaxSize?: number
}

/** Our toolbar, as a top-area child (MDXEditor's toolbar plugin is not used). */
const richTextToolbarPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({ [addTopAreaChild$]: RichTextToolbar })
  },
})

/** The built-in plugins, in toolbar order. Exported so a test or an app can see what the editor understands. */
export function richTextPlugins({
  diffMarkdown = "",
  viewMode = "rich-text",
  codeBlockLanguages = RICH_TEXT_CODE_LANGUAGES,
  plugins = [],
  resolveImageSrc,
}: Pick<RichTextEditorProps, "diffMarkdown" | "viewMode" | "codeBlockLanguages" | "plugins" | "resolveImageSrc">): RealmPlugin[] {
  return [
    headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin({ LinkDialog: RichTextLinkDialog }),
    imagePlugin({
      ImageDialog: RichTextImageDialog,
      // Typed as a prop-less component upstream, but MDXEditor renders it with the image's props (nodeKey, src, alt, …).
      EditImageToolbar: RichTextImageToolbar as unknown as React.FC,
      imagePreviewHandler: resolveImageSrc ? (src) => Promise.resolve(resolveImageSrc(src)) : null,
    }),
    tablePlugin({ tablePipeAlign: false }),
    codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
    codeMirrorPlugin({ codeBlockLanguages }),
    frontmatterPlugin(),
    markdownShortcutPlugin(),
    diffSourcePlugin({ diffMarkdown, viewMode }),
    ...plugins,
    richTextToolbarPlugin(),
  ]
}

/** Files end with a newline; MDXEditor trims its output, so put one back (an empty document stays empty). */
export function withFinalNewline(markdown: string) {
  return markdown === "" || markdown.endsWith("\n") ? markdown : markdown + "\n"
}

/** MDXEditor's own default: the English text with `{{name}}` filled in. */
function defaultTranslation(_key: string, defaultValue: string, interpolations?: Record<string, unknown>) {
  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(interpolations?.[name] ?? ""))
}

/** The editing area's name comes through MDXEditor's `contentArea.editableMarkdown` text; everything else is the caller's. */
export function richTextTranslation(ariaLabel: string, translation: Translation = defaultTranslation): Translation {
  return (key, defaultValue, interpolations) => (key === "contentArea.editableMarkdown" ? ariaLabel : translation(key, defaultValue, interpolations))
}

const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    markdown,
    onChange,
    ariaLabel,
    placeholder,
    diffMarkdown,
    viewMode,
    plugins,
    toolbarExtra,
    codeBlockLanguages,
    toMarkdownOptions,
    translation,
    readOnly = false,
    autoFocus = false,
    contentEditableClassName,
    className,
    onError,
    messages,
    onUploadImage,
    resolveImageSrc,
    imageAccept = RICH_TEXT_IMAGE_ACCEPT,
    imageMaxSize = RICH_TEXT_IMAGE_MAX_SIZE,
  },
  ref,
) {
  const inner = React.useRef<MDXEditorMethods | null>(null)
  // Plugins are read once, when MDXEditor mounts.
  const [allPlugins] = React.useState(() => richTextPlugins({ diffMarkdown, viewMode, codeBlockLanguages, plugins, resolveImageSrc }))
  const options = React.useMemo<RichTextOptions>(
    () => ({ messages: { ...RICH_TEXT_MESSAGES, ...messages }, onUploadImage, imageAccept, imageMaxSize, toolbarExtra }),
    [messages, onUploadImage, imageAccept, imageMaxSize, toolbarExtra],
  )
  const t = React.useMemo(() => richTextTranslation(ariaLabel, translation), [ariaLabel, translation])

  React.useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => withFinalNewline(inner.current?.getMarkdown() ?? ""),
      setMarkdown: (value) => inner.current?.setMarkdown(value),
      insertMarkdown: (value) => inner.current?.insertMarkdown(value),
      focus: (callbackFn, opts) => inner.current?.focus(callbackFn, opts),
      getContentEditableHTML: () => inner.current?.getContentEditableHTML() ?? "",
      getSelectionMarkdown: () => inner.current?.getSelectionMarkdown() ?? "",
    }),
    [],
  )

  return (
    <RichTextContext.Provider value={options}>
      <div data-slot="rich-text-editor" data-readonly={readOnly || undefined}>
        <MDXEditor
          ref={inner}
          markdown={markdown}
          onChange={onChange ? (value) => onChange(withFinalNewline(value)) : undefined}
          plugins={allPlugins}
          className={cn(RICH_TEXT_EDITOR_CLASS, className)}
          contentEditableClassName={cn(RICH_TEXT_CONTENT_CLASS, contentEditableClassName)}
          iconComponentFor={richTextIcon}
          toMarkdownOptions={{ ...RICH_TEXT_MARKDOWN_OPTIONS, ...toMarkdownOptions }}
          translation={t}
          placeholder={placeholder}
          readOnly={readOnly}
          autoFocus={autoFocus}
          trim={false}
          onError={onError}
        />
      </div>
    </RichTextContext.Provider>
  )
})

export { RichTextEditor }
export type { RichTextEditorProps }
