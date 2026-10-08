"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { useOverflowFocusable } from "@/components/ui/overflow-focusable"
import { dialogRoleProps, outsideInteractionDecision } from "@/components/ui/dialog-guard"
import {
  BODY_CLASS,
  CLOSE_CLASS,
  CONFIRM_ICON_CLASS,
  CONTENT_CLASS,
  CONTENT_LARGE_CLASS,
  FOOTER_CLASS,
  HEADER_CLASS,
  OVERLAY_CLASS,
} from "@/components/ui/dialog-classes"
import { Trash2Icon, XIcon } from "lucide-react"

/**
 * US-175 (NFR-013, FR-049; ADR-014, ADR-019): the design system's Modal on the vendored Radix dialog (the nonce bridge and
 * focus handling are Radix's, unchanged). `surface-raised` with the faint hairline and `shadow-raised`; a header (title,
 * optional description, Close), a body and a `muted` footer. `size="large"` is the connect dialog; `variant="confirm"` is
 * the destructive confirmation: `role="alertdialog"` and a status icon in the header, as the mockup draws it. Motion is
 * guarded: no animation class is applied outside `motion-safe:` (a pinned unit test). Colours come only from tokens.
 */
type DialogVariant = "default" | "confirm"
type DialogSize = "default" | "large"

const DialogContext = React.createContext<{ variant: DialogVariant; showCloseButton: boolean }>({
  variant: "default",
  showCloseButton: true,
})

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(OVERLAY_CLASS, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton,
  variant = "default",
  size = "default",
  dirty = false,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Defaults to true, except the confirm variant, which the mockup draws without one. */
  showCloseButton?: boolean
  variant?: DialogVariant
  size?: DialogSize
  /** A form dialog the viewer has typed in: an outside click no longer closes it (`dialog-guard.ts`). */
  dirty?: boolean
}) {
  const withClose = showCloseButton ?? variant !== "confirm"
  const context = React.useMemo(() => ({ variant, showCloseButton: withClose }), [variant, withClose])
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        {...dialogRoleProps(variant)}
        className={cn(CONTENT_CLASS, size === "large" && CONTENT_LARGE_CLASS, className)}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          if (outsideInteractionDecision({ dirty }) === "prevent") event.preventDefault()
        }}
        {...props}
      >
        <DialogContext.Provider value={context}>{children}</DialogContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogCloseButton() {
  return (
    <DialogPrimitive.Close data-slot="dialog-close" asChild>
      <Button variant="ghost" className={CLOSE_CLASS} size="icon-sm">
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </DialogPrimitive.Close>
  )
}

/**
 * The header: its children (title, optional description) sit left, the Close button right. In the confirm variant a status
 * icon (the mockup's trash) precedes the title and there is no Close button.
 */
function DialogHeader({
  className,
  children,
  icon,
  ...props
}: React.ComponentProps<"div"> & { icon?: React.ReactNode }) {
  const { variant, showCloseButton } = React.useContext(DialogContext)
  const text = <div className="grid min-w-0 gap-2">{children}</div>
  return (
    <div data-slot="dialog-header" className={cn(HEADER_CLASS, className)} {...props}>
      {variant === "confirm" ? (
        <div className="flex min-w-0 items-start gap-4">
          <span data-slot="dialog-icon" aria-hidden="true" className={CONFIRM_ICON_CLASS}>
            {icon ?? <Trash2Icon />}
          </span>
          {text}
        </div>
      ) : (
        text
      )}
      {showCloseButton ? <DialogCloseButton /> : null}
    </div>
  )
}

/**
 * The scrolling body between header and footer. A scroll region that overflows is made focusable (tabindex 0) so a keyboard
 * viewer can scroll it, and takes the global focus outline; one that fits is not a tab stop.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null)
  useOverflowFocusable(ref, "y")
  return <div ref={ref} data-slot="dialog-body" className={cn(BODY_CLASS, className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(FOOTER_CLASS, className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-xl leading-6 font-bold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
