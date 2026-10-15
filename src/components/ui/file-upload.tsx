"use client"

import * as React from "react"
import { CircleCheckIcon, FileIcon, OctagonAlertIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react"

import { formatBytes, formatProgress, partitionFiles, uploadPercent, type FileRejectReason } from "@/components/ui/file-upload-rules"
import { cn } from "@/lib/utils"
import { percentWidthClass } from "@/components/ui/percent-width"
import { HIT_AREA_COARSE_CLASS } from "@/components/ui/hit-area"

/**
 * The design system's FileUpload (`project/components/FileUpload`): a dashed drop zone over a native file input, and a list
 * of the files being uploaded, uploaded or refused (a CV, a CSV of leads).
 *
 * - The zone is a `<label>` around a native `<input type="file">` with `accept`, so a click opens the file dialog and the
 *   keyboard and screen readers get the normal control; dragging is only an extra. The input's `aria-describedby` is the hint.
 * - The hint always states the accepted types and the size limit, before any upload ("CSV, up to 10 MB").
 * - Picked or dropped files are checked against `accept` and `maxSize` here (`partitionFiles`); `onFiles` gets the accepted
 *   ones and the refused ones with the reason. Check them again on the server.
 * - States: default (dashed `border-strong` on `surface-muted`), hover (`border-hover`), focus (the focus ring around the zone
 *   while the input has keyboard focus), drag-over (solid `primary-text` on `surface-selected`, "Release to upload"),
 *   disabled (`opacity-disabled`).
 * - Rows (`items`, controlled by the caller): uploading (a progressbar and "1.2 of 1.9 MB · 64%", its button cancels), done
 *   (a `success` check and "Uploaded", its button removes), error (`danger-surface` and the reason in words, `role="alert"`).
 *   Each button names the file it acts on.
 */

export type FileUploadStatus = "uploading" | "done" | "error"

export interface FileUploadItem {
  id: string
  /** Show the candidate ID in file names, never a candidate's real name. */
  name: string
  /** Bytes. */
  size: number
  status: FileUploadStatus
  /** Bytes sent so far, while uploading. */
  loaded?: number
  /** The reason in words, for an error row ("Not uploaded: 14.2 MB is over the 10 MB limit."). */
  error?: React.ReactNode
}

export interface FileUploadMessages {
  /** The drag-over title. */
  release: string
  /** The done row's word. */
  uploaded: string
  /** The word in "1.2 of 1.9 MB". */
  of: string
  listLabel: string
  uploading: (name: string) => string
  cancel: (name: string) => string
  remove: (name: string) => string
  dismiss: (name: string) => string
}

export const FILE_UPLOAD_MESSAGES: FileUploadMessages = {
  release: "Release to upload",
  uploaded: "Uploaded",
  of: "of",
  listLabel: "Uploaded files",
  uploading: (name) => `Uploading ${name}`,
  cancel: (name) => `Cancel upload of ${name}`,
  remove: (name) => `Remove ${name}`,
  dismiss: (name) => `Dismiss ${name}`,
}

export interface FileUploadProps extends Omit<React.ComponentProps<"div">, "title" | "onDrop"> {
  /** The field label. */
  label: React.ReactNode
  /** The zone's title; mark the browse word with `<u>`: `<>Drop a CSV here or <u>browse</u></>`. */
  title: React.ReactNode
  /** The accepted types and the size limit, in words ("CSV, up to 10 MB"). Required: it is stated before any upload. */
  hint: React.ReactNode
  /** The native `accept` list (".csv,text/csv"). */
  accept?: string
  /** The size limit in bytes; files over it are refused before upload. */
  maxSize?: number
  multiple?: boolean
  disabled?: boolean
  name?: string
  /** The admin label (`label-form`, 14/20 bold, `ink`; the default) or the website's (`label`, 12/16, `ink-muted`). */
  labelVariant?: "admin" | "site"
  /** Accepted and refused files from a pick or a drop. */
  onFiles?: (accepted: File[], rejected: { file: File; reason: FileRejectReason }[]) => void
  items?: readonly FileUploadItem[]
  /** Cancel (uploading), remove (done) or dismiss (error) a row. */
  onRemove?: (item: FileUploadItem) => void
  messages?: Partial<FileUploadMessages>
  /** The locale for sizes ("1,9 MB"). */
  locale?: string
}

function FileUpload({
  label,
  title,
  hint,
  accept,
  maxSize,
  multiple,
  disabled,
  name,
  labelVariant = "admin",
  onFiles,
  items = [],
  onRemove,
  messages,
  locale = "en",
  className,
  id,
  ...props
}: FileUploadProps) {
  const auto = React.useId()
  const base = id ?? auto
  const labelId = `${base}-label`
  const hintId = `${base}-hint`
  const m = { ...FILE_UPLOAD_MESSAGES, ...messages }
  const [dragging, setDragging] = React.useState(false)
  const depth = React.useRef(0)

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = multiple ? Array.from(list) : Array.from(list).slice(0, 1)
    const { accepted, rejected } = partitionFiles(files, { accept, maxSize })
    onFiles?.(accepted, rejected)
  }

  const dragProps = disabled
    ? {}
    : {
        onDragEnter: (event: React.DragEvent) => {
          event.preventDefault()
          depth.current += 1
          setDragging(true)
        },
        onDragOver: (event: React.DragEvent) => event.preventDefault(),
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragging(false)
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault()
          depth.current = 0
          setDragging(false)
          take(event.dataTransfer.files)
        },
      }

  return (
    <div data-slot="file-upload" id={id} className={cn("grid min-w-0 gap-3 font-sans text-foreground", className)} {...props}>
      <span
        id={labelId}
        data-slot="file-upload-label"
        className={labelVariant === "admin" ? "text-label-form text-foreground" : "text-label text-ink-muted"}
      >
        {label}
      </span>
      <label
        data-slot="file-upload-zone"
        data-dragover={dragging || undefined}
        className={cn(
          "relative grid cursor-pointer justify-items-center gap-2 rounded-(--ds-radius-md) border-(length:--border-divider) border-dashed border-border-strong bg-muted px-6 py-8 text-center outline-offset-2 transition-colors duration-(--duration-base) ease-(--ease-base) hover:border-border-hover motion-reduce:transition-none has-[:focus-visible]:outline-solid has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-(--opacity-disabled)",
          dragging && "border-solid border-primary-text bg-surface-selected hover:border-primary-text",
        )}
        {...dragProps}
      >
        <input
          data-slot="file-upload-input"
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className="absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => {
            take(event.currentTarget.files)
            event.currentTarget.value = ""
          }}
        />
        <UploadIcon aria-hidden="true" strokeWidth={1.5} className="size-(--space-32) text-primary-text" />
        <p data-slot="file-upload-title" className="m-0 text-body-strong [&_u]:text-primary-text [&_u]:underline-offset-2">
          {dragging ? m.release : title}
        </p>
        <p id={hintId} data-slot="file-upload-hint" className="m-0 text-caption text-ink-secondary">
          {hint}
        </p>
      </label>
      {items.length > 0 ? (
        <ul data-slot="file-upload-list" aria-label={m.listLabel} className="m-0 grid list-none gap-2 p-0">
          {items.map((item) => (
            <FileUploadRow key={item.id} item={item} messages={m} locale={locale} onRemove={onRemove} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const ROW_ICON = { uploading: FileIcon, done: CircleCheckIcon, error: OctagonAlertIcon } as const
const ROW_ICON_CLASS = { uploading: "text-ink-secondary", done: "text-success", error: "text-danger" } as const

function FileUploadRow({
  item,
  messages,
  locale = "en",
  onRemove,
}: {
  item: FileUploadItem
  messages: FileUploadMessages
  locale?: string
  onRemove?: (item: FileUploadItem) => void
}) {
  const Icon = ROW_ICON[item.status]
  const pct = uploadPercent(item.loaded ?? 0, item.size)
  const action = item.status === "uploading" ? messages.cancel : item.status === "done" ? messages.remove : messages.dismiss
  const ActionIcon = item.status === "done" ? Trash2Icon : XIcon
  return (
    <li
      data-slot="file-upload-item"
      data-status={item.status}
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-(--ds-radius-md) border p-3",
        item.status === "error" ? "border-danger-border bg-danger-surface" : "border-border bg-background",
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.5} className={cn("size-(--icon-control)", ROW_ICON_CLASS[item.status])} />
      <div className="grid min-w-0 gap-1">
        <p data-slot="file-upload-name" className="m-0 truncate text-small">
          {item.name}
        </p>
        {item.status === "uploading" ? (
          <>
            <span
              data-slot="file-upload-progress"
              role="progressbar"
              aria-label={messages.uploading(item.name)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="block h-[calc(var(--progress-h)/2)] w-full overflow-hidden rounded-(--ds-radius-pill) bg-track"
            >
              <span
                data-slot="file-upload-progress-fill"
                className={cn("block h-full rounded-[inherit] bg-primary-text transition-[width] duration-(--duration-base) ease-(--ease-base) motion-reduce:transition-none", percentWidthClass(pct / 100))}
              />
            </span>
            <p data-slot="file-upload-size" className="m-0 text-caption text-ink-secondary tabular-nums">
              {formatProgress(item.loaded ?? 0, item.size, messages.of, locale)}
            </p>
          </>
        ) : item.status === "done" ? (
          <p data-slot="file-upload-size" className="m-0 text-caption text-ink-secondary tabular-nums">
            {formatBytes(item.size, locale)} · {messages.uploaded}
          </p>
        ) : (
          <p data-slot="file-upload-error" role="alert" className="m-0 text-small text-danger">
            {item.error}
          </p>
        )}
      </div>
      <button
        data-slot="file-upload-remove"
        type="button"
        aria-label={action(item.name)}
        onClick={() => onRemove?.(item)}
        className={cn(
          "inline-flex size-(--space-32) cursor-pointer items-center justify-center rounded-(--ds-radius-sm) border-0 bg-transparent p-0 text-ink-secondary outline-offset-2 hover:bg-hover-overlay hover:text-foreground [&_svg]:size-(--icon-ui)",
          HIT_AREA_COARSE_CLASS,
        )}
      >
        <ActionIcon aria-hidden="true" strokeWidth={1.5} />
      </button>
    </li>
  )
}

export { FileUpload, FileUploadRow }
