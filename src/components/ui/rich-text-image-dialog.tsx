"use client"

import * as React from "react"
import {
  activeEditor$,
  closeImageDialog$,
  imageDialogState$,
  openEditImageDialog$,
  readOnly$,
  saveImage$,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor"
import { $getNodeByKey } from "lexical"
import { Settings2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileUpload, type FileUploadItem } from "@/components/ui/file-upload"
import { useRichText } from "@/components/ui/rich-text-context"
import { TextField } from "@/components/ui/text-field"
import { TooltipIconButton } from "@/components/ui/tooltip"

/**
 * The RichTextEditor's image dialog (v49), in place of MDXEditor's: a Dialog with the design system's FileUpload (only when
 * the app passes `onUploadImage`), the image address, alt text and an optional title. A picked file uploads at once and its
 * address fills the address field, so the person sees what will be written. Insert needs an address; alt text is asked for
 * in the hint, never forced.
 */
interface Fields {
  src: string
  altText: string
  title: string
}

export function RichTextImageDialog() {
  const { messages: m } = useRichText()
  const [state] = useCellValues(imageDialogState$)
  const close = usePublisher(closeImageDialog$)
  const [dirty, setDirty] = React.useState(false)
  return (
    <Dialog open={state.type !== "inactive"} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent closeLabel={m.close} dirty={dirty && state.type === "new"} data-slot="rich-text-image-dialog">
        {state.type === "inactive" ? null : (
          <ImageForm initial={state.type === "editing" ? state.initialValues : undefined} onDirty={setDirty} onCancel={() => close()} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's form, mounted on each opening, so it starts from the image being edited or empty. */
function ImageForm({
  initial,
  onDirty,
  onCancel,
}: {
  initial?: { src?: string; altText?: string; title?: string }
  onDirty: (dirty: boolean) => void
  onCancel: () => void
}) {
  const { messages: m, onUploadImage, imageAccept, imageMaxSize } = useRichText()
  const saveImage = usePublisher(saveImage$)
  const [fields, setFields] = React.useState<Fields>(() => ({ src: initial?.src ?? "", altText: initial?.altText ?? "", title: initial?.title ?? "" }))
  const [upload, setUpload] = React.useState<FileUploadItem | null>(null)
  const [missing, setMissing] = React.useState(false)
  const editing = initial !== undefined

  const update = (next: Fields) => {
    setFields(next)
    onDirty(next.src !== "" || next.altText !== "" || next.title !== "")
  }
  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    update({ ...fields, [key]: event.target.value })
    if (key === "src") setMissing(false)
  }

  const onFiles = async (accepted: File[]) => {
    const file = accepted[0]
    if (!file || !onUploadImage) return
    const id = `${file.name}-${file.size}-${file.lastModified}`
    setUpload({ id, name: file.name, size: file.size, status: "uploading" })
    try {
      const src = await onUploadImage(file)
      setFields((current) => ({ ...current, src }))
      onDirty(true)
      setMissing(false)
      setUpload({ id, name: file.name, size: file.size, status: "done" })
    } catch {
      setUpload({ id, name: file.name, size: file.size, status: "error", error: m.imageUploadFailed })
    }
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fields.src.trim() === "") {
      setMissing(true)
      return
    }
    onDirty(false)
    saveImage({ src: fields.src.trim(), altText: fields.altText, title: fields.title })
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? m.imageEditTitle : m.imageNewTitle}</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        {onUploadImage ? (
          <FileUpload
            label={m.imageFile}
            title={m.imageDrop}
            hint={m.imageHint}
            accept={imageAccept}
            maxSize={imageMaxSize}
            onFiles={(accepted) => void onFiles(accepted)}
            items={upload ? [upload] : []}
            onRemove={() => setUpload(null)}
          />
        ) : null}
        <TextField
          label={m.imageAddress}
          hint={m.imageAddressHint}
          value={fields.src}
          onChange={set("src")}
          error={missing ? m.imageMissing : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <TextField label={m.imageAlt} hint={m.imageAltHint} value={fields.altText} onChange={set("altText")} />
        <TextField label={m.imageTitle} marker="optional" markerLabels={{ optional: m.optional }} value={fields.title} onChange={set("title")} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.cancel}
        </Button>
        <Button type="submit" disabled={upload?.status === "uploading"}>
          {editing ? m.save : m.insert}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * The controls on an image in the editor (v49), in place of MDXEditor's: Edit and Remove as `icon` (32px) buttons with
 * tooltips, on a raised chip in the image's top corner.
 */
export function RichTextImageToolbar({
  nodeKey,
  imageSource,
  initialImagePath,
  title,
  alt,
}: {
  nodeKey: string
  imageSource: string
  initialImagePath: string | null
  title: string
  alt: string
}) {
  const { messages: m } = useRichText()
  const [editor, readOnly] = useCellValues(activeEditor$, readOnly$)
  const openEdit = usePublisher(openEditImageDialog$)
  if (readOnly) return null
  return (
    <div
      data-slot="rich-text-image-toolbar"
      className="absolute end-2 top-2 z-(--z-sticky) flex gap-1 rounded-(--ds-radius-md) border border-border bg-surface-raised p-1 shadow-(--shadow-raised)"
    >
      <TooltipIconButton
        label={m.imageEdit}
        size="icon"
        onClick={() => openEdit({ nodeKey, initialValues: { src: initialImagePath ?? imageSource, title, altText: alt } })}
      >
        <Settings2 aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        label={m.imageRemove}
        size="icon"
        onClick={() => editor?.update(() => $getNodeByKey(nodeKey)?.remove())}
      >
        <Trash2 aria-hidden="true" />
      </TooltipIconButton>
    </div>
  )
}
