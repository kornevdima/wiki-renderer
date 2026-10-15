"use client"

import * as React from "react"
import {
  cancelLinkEdit$,
  linkDialogState$,
  removeLink$,
  switchFromPreviewToLinkEdit$,
  updateLink$,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor"
import { ExternalLink, Pencil, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRichText } from "@/components/ui/rich-text-context"
import { TextField } from "@/components/ui/text-field"
import { TooltipIconButton } from "@/components/ui/tooltip"

/**
 * The RichTextEditor's link controls (v49), in place of MDXEditor's link popover:
 *
 * - **Edit** (the toolbar's Link, ⌘K in the editor, or Edit on a link): a Dialog with the address, the link text when the
 *   selection has none of its own, and an optional title. Save writes the link; an existing link also offers Remove.
 * - **Preview** (the caret on a link): a small raised panel under the link with its address (opens in a new tab), Edit and
 *   Remove, as icon buttons with tooltips.
 */
interface Fields {
  url: string
  text: string
  title: string
}

const PANEL_CLASS =
  "fixed z-(--z-popover) flex max-w-[min(28rem,calc(100vw-2rem))] items-center gap-1 rounded-(--ds-radius-md) border border-border bg-popover p-1 ps-3 text-ink shadow-(--shadow-raised)"

export function RichTextLinkDialog() {
  const { messages: m } = useRichText()
  const [state] = useCellValues(linkDialogState$)
  const cancel = usePublisher(cancelLinkEdit$)
  const removeLink = usePublisher(removeLink$)
  const edit = usePublisher(switchFromPreviewToLinkEdit$)

  if (state.type === "preview") {
    const { rectangle } = state
    const href = state.href ?? state.url
    return (
      <div
        role="group"
        aria-label={m.link}
        data-slot="rich-text-link-preview"
        className={PANEL_CLASS}
        style={{ top: rectangle.top + rectangle.height + 6, left: rectangle.left }}
      >
        <a href={href} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-sm text-primary-text underline">
          {state.url}
        </a>
        <TooltipIconButton label={m.linkOpen} size="icon" asChild>
          <a href={href} target="_blank" rel="noreferrer noopener">
            <ExternalLink aria-hidden="true" />
          </a>
        </TooltipIconButton>
        <TooltipIconButton label={m.linkEdit} size="icon" onClick={() => edit()}>
          <Pencil aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton label={m.linkRemove} size="icon" onClick={() => removeLink()}>
          <Unlink aria-hidden="true" />
        </TooltipIconButton>
      </div>
    )
  }

  return (
    <Dialog open={state.type === "edit"} onOpenChange={(next) => (next ? undefined : cancel())}>
      <DialogContent closeLabel={m.close} data-slot="rich-text-link-dialog">
        {state.type === "edit" ? (
          <LinkForm
            initial={{ url: state.url, text: state.text, title: state.title }}
            existing={state.initialUrl !== ""}
            withText={state.withAnchorText}
            onCancel={() => cancel()}
            onRemove={() => removeLink()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's form, mounted on each opening with the link being edited. */
function LinkForm({
  initial,
  existing,
  withText,
  onCancel,
  onRemove,
}: {
  initial: Fields
  existing: boolean
  withText: boolean
  onCancel: () => void
  onRemove: () => void
}) {
  const { messages: m } = useRichText()
  const updateLink = usePublisher(updateLink$)
  const [fields, setFields] = React.useState<Fields>(initial)
  const [missing, setMissing] = React.useState(false)
  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFields((current) => ({ ...current, [key]: event.target.value }))
    if (key === "url") setMissing(false)
  }
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fields.url.trim() === "") {
      setMissing(true)
      return
    }
    updateLink({ url: fields.url.trim(), text: fields.text, title: fields.title })
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{existing ? m.linkEditTitle : m.linkNewTitle}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        <TextField
          label={m.linkAddress}
          value={fields.url}
          onChange={set("url")}
          error={missing ? m.linkMissing : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        {withText ? <TextField label={m.linkText} value={fields.text} onChange={set("text")} /> : null}
        <TextField label={m.linkTitle} marker="optional" markerLabels={{ optional: m.optional }} value={fields.title} onChange={set("title")} />
      </DialogBody>
      <DialogFooter>
        {existing ? (
          <Button type="button" variant="ghost" className="me-auto" onClick={onRemove}>
            {m.linkRemove}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.cancel}
        </Button>
        <Button type="submit">{m.save}</Button>
      </DialogFooter>
    </form>
  )
}
