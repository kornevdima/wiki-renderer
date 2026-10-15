"use client"

import * as React from "react"
import {
  activeEditor$,
  allowedHeadingLevels$,
  applyBlockType$,
  applyFormat$,
  applyListType$,
  currentBlockType$,
  currentFormat$,
  currentListType$,
  hasFrontmatter$,
  insertCodeBlock$,
  insertFrontmatter$,
  insertTable$,
  insertThematicBreak$,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  openLinkEditDialog$,
  openNewImageDialog$,
  readOnly$,
  useCellValues,
  usePublisher,
  viewMode$,
  type BlockType,
  type ViewMode,
} from "@mdxeditor/editor"
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL, REDO_COMMAND, UNDO_COMMAND } from "lexical"
import {
  Bold,
  Braces,
  Code,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Redo2,
  SquareCode,
  Strikethrough,
  Table,
  Undo2,
} from "lucide-react"

import { useRichText } from "@/components/ui/rich-text-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/tabs"
import { TooltipIconButton } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The RichTextEditor's toolbar (added 2026-10-16 in v49, owner: "buttons too small and might be not so easy to control"):
 * ESG controls driven by MDXEditor's public state, in place of MDXEditor's own toolbar.
 *
 * - Icon buttons are the `icon-lg` Button (36px; 44px hit area under a coarse pointer), ghost, with the name as a tooltip
 *   (TooltipIconButton). A toggle that is on is `aria-pressed` on `surface-selected` in `primary-text`.
 * - Groups: history, text style (a Select), inline formats, lists, insert (link, image, table, code block, rule,
 *   properties), the app's own items, then the view switch (a SegmentedControl). Groups wrap whole onto more rows in a
 *   narrow column, 12px apart (no separator lines to strand at a row's end); 4px between buttons keeps two 36px
 *   controls' coarse hit areas apart.
 * - One tab stop (WAI-ARIA toolbar): the arrow keys move between the buttons and the text style Select, Home and End jump to
 *   the ends. The view switch is its own tab stop with its own arrow keys.
 * - In the source and changes views only the view switch shows: the formatting controls act on the rich text.
 */
const ITEM = "[data-rte-item]"
const PRESSED = "aria-pressed:bg-surface-selected aria-pressed:text-primary-text"

/** One group of related controls; groups sit 12px apart, so a wrapped row never starts or ends with a separator. */
function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>
}

function ToolbarButton({
  label,
  pressed,
  className,
  ...props
}: Omit<React.ComponentProps<typeof TooltipIconButton>, "size" | "variant" | "aria-pressed"> & { pressed?: boolean }) {
  return (
    <TooltipIconButton
      label={label}
      size="icon-lg"
      variant="ghost"
      aria-pressed={pressed}
      data-rte-item=""
      tabIndex={-1}
      className={cn(PRESSED, "[&_svg]:size-4", className)}
      {...props}
    />
  )
}

function useHistory() {
  const [activeEditor] = useCellValues(activeEditor$)
  const [canUndo, setCanUndo] = React.useState(false)
  const [canRedo, setCanRedo] = React.useState(false)
  React.useEffect(() => {
    if (!activeEditor) return
    const offUndo = activeEditor.registerCommand(CAN_UNDO_COMMAND, (value: boolean) => (setCanUndo(value), false), COMMAND_PRIORITY_CRITICAL)
    const offRedo = activeEditor.registerCommand(CAN_REDO_COMMAND, (value: boolean) => (setCanRedo(value), false), COMMAND_PRIORITY_CRITICAL)
    return () => {
      offUndo()
      offRedo()
    }
  }, [activeEditor])
  return {
    canUndo,
    canRedo,
    undo: () => activeEditor?.dispatchCommand(UNDO_COMMAND, undefined),
    redo: () => activeEditor?.dispatchCommand(REDO_COMMAND, undefined),
  }
}

/** Roving focus for the toolbar's items: one tab stop, arrow keys between items. */
function useRovingFocus(root: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = React.useState(0)
  React.useEffect(() => {
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
    items.forEach((item, index) => item.setAttribute("tabindex", index === Math.min(active, items.length - 1) ? "0" : "-1"))
  })
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM) ?? []).filter((item) => !item.hasAttribute("disabled"))
    const index = items.indexOf(event.target as HTMLElement)
    if (index === -1) return
    const next =
      event.key === "ArrowRight" ? (index + 1) % items.length
      : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
      : event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : -1
    if (next === -1) return
    event.preventDefault()
    items[next]!.focus()
  }
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const all = Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
    const index = all.indexOf(event.target as HTMLElement)
    if (index !== -1 && index !== active) setActive(index)
  }
  return { onKeyDown, onFocus }
}

export function RichTextToolbar() {
  const { messages: m, toolbarExtra } = useRichText()
  const [format, listType, blockType, headingLevels, hasFrontmatter, viewMode, readOnly] = useCellValues(
    currentFormat$,
    currentListType$,
    currentBlockType$,
    allowedHeadingLevels$,
    hasFrontmatter$,
    viewMode$,
    readOnly$,
  )
  const applyFormat = usePublisher(applyFormat$)
  const applyListType = usePublisher(applyListType$)
  const applyBlockType = usePublisher(applyBlockType$)
  const insertTable = usePublisher(insertTable$)
  const insertCodeBlock = usePublisher(insertCodeBlock$)
  const insertRule = usePublisher(insertThematicBreak$)
  const insertFrontmatter = usePublisher(insertFrontmatter$)
  const openLink = usePublisher(openLinkEditDialog$)
  const openImage = usePublisher(openNewImageDialog$)
  const setViewMode = usePublisher(viewMode$)
  const history = useHistory()
  const root = React.useRef<HTMLDivElement | null>(null)
  const roving = useRovingFocus(root)
  const rich = viewMode === "rich-text"
  const list = (type: "bullet" | "number" | "check") => applyListType(listType === type ? "" : type)

  return (
    <div
      ref={root}
      role="toolbar"
      aria-label={m.toolbar}
      aria-disabled={readOnly || undefined}
      data-slot="rich-text-toolbar"
      className="esg-rte__toolbar flex flex-wrap items-center gap-x-3 gap-y-2 p-2"
      onKeyDown={roving.onKeyDown}
      onFocus={roving.onFocus}
    >
      {rich && !readOnly ? (
        <>
          <Group>
            <ToolbarButton label={m.undo} disabled={!history.canUndo} onClick={history.undo}>
              <Undo2 aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.redo} disabled={!history.canRedo} onClick={history.redo}>
              <Redo2 aria-hidden="true" />
            </ToolbarButton>
          </Group>
          <Group>
            <Select value={blockType} onValueChange={(value) => applyBlockType(value as BlockType)}>
              <SelectTrigger aria-label={m.textStyle} data-rte-item="" tabIndex={-1} className="h-9 min-w-36 border-transparent bg-transparent text-sm hover:bg-(--shade-hover)">
                <SelectValue placeholder={m.textStyle} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paragraph">{m.paragraph}</SelectItem>
                {headingLevels.map((level) => (
                  <SelectItem key={level} value={`h${level}`}>
                    {m.heading(level)}
                  </SelectItem>
                ))}
                <SelectItem value="quote">{m.quote}</SelectItem>
              </SelectContent>
            </Select>
          </Group>
          <Group>
            <ToolbarButton label={m.bold} pressed={(format & IS_BOLD) !== 0} onClick={() => applyFormat("bold")}>
              <Bold aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.italic} pressed={(format & IS_ITALIC) !== 0} onClick={() => applyFormat("italic")}>
              <Italic aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.strikethrough} pressed={(format & IS_STRIKETHROUGH) !== 0} onClick={() => applyFormat("strikethrough")}>
              <Strikethrough aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.inlineCode} pressed={(format & IS_CODE) !== 0} onClick={() => applyFormat("code")}>
              <Code aria-hidden="true" />
            </ToolbarButton>
          </Group>
          <Group>
            <ToolbarButton label={m.bulletedList} pressed={listType === "bullet"} onClick={() => list("bullet")}>
              <List aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.numberedList} pressed={listType === "number"} onClick={() => list("number")}>
              <ListOrdered aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.checklist} pressed={listType === "check"} onClick={() => list("check")}>
              <ListChecks aria-hidden="true" />
            </ToolbarButton>
          </Group>
          <Group>
            <ToolbarButton label={m.link} onClick={() => openLink()}>
              <Link aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.image} onClick={() => openImage()}>
              <ImagePlus aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.table} onClick={() => insertTable({ rows: 3, columns: 3 })}>
              <Table aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.codeBlock} onClick={() => insertCodeBlock({})}>
              <SquareCode aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={m.rule} onClick={() => insertRule()}>
              <Minus aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={hasFrontmatter ? m.editProperties : m.addProperties} pressed={hasFrontmatter} onClick={() => insertFrontmatter()}>
              <Braces aria-hidden="true" />
            </ToolbarButton>
          </Group>
          {toolbarExtra ? <Group>{toolbarExtra}</Group> : null}
        </>
      ) : null}
      <SegmentedControl aria-label={m.view} value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="ms-auto">
        <SegmentedControlItem value="rich-text">{m.richText}</SegmentedControlItem>
        <SegmentedControlItem value="source">{m.source}</SegmentedControlItem>
        <SegmentedControlItem value="diff">{m.changes}</SegmentedControlItem>
      </SegmentedControl>
    </div>
  )
}
