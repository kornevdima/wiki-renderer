"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { useOverflowFocusable } from "@/components/ui/overflow-focusable"
import {
  DISCARD_DEFAULT_LABELS,
  closeRequestDecision,
  dialogRoleProps,
  escapeKeyDecision,
  formForShortcut,
  outsideInteractionDecision,
  submitFromShortcut,
  type DiscardLabels,
} from "@/components/ui/dialog-guard"
import { MODAL_LAYER_PROPS, SHORTCUTS, isComposing, matchShortcut } from "@/lib/keyboard"
import { useReturnFocus } from "@/components/ui/return-focus"
import {
  BODY_CLASS,
  CLOSE_CLASS,
  CONFIRM_ICON_CLASS,
  CONTENT_CLASS,
  CONTENT_LARGE_CLASS,
  DISCARD_ACTIONS_CLASS,
  DISCARD_BAR_CLASS,
  DISCARD_ICON_CLASS,
  DISCARD_TEXT_CLASS,
  FOOTER_CLASS,
  HEADER_CLASS,
  OVERLAY_CLASS,
  SECTION_CAPTION_CLASS,
  SECTION_CLASS,
  SECTION_HEAD_CLASS,
  SECTION_TITLE_ACCENT_CLASS,
  SECTION_TITLE_CLASS,
} from "@/components/ui/dialog-classes"
import { Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react"

/**
 * US-175 (NFR-013, FR-049; ADR-014, ADR-019): the design system's Modal on the vendored Radix dialog (the nonce bridge and
 * focus handling are Radix's, unchanged). `surface-raised` with the faint hairline and `shadow-raised`; a header (title,
 * optional description, Close), a body and a `muted` footer. `size="large"` is the connect dialog; `variant="confirm"` is
 * the destructive confirmation: `role="alertdialog"` and a status icon in the header, as the mockup draws it. Motion is
 * guarded: no animation class is applied outside `motion-safe:` (a pinned unit test). Colours come only from tokens.
 */
type DialogVariant = "default" | "confirm"
type DialogSize = "default" | "large"

/** US-224: the Close label's English default. Apps pass their translation as `closeLabel` (see DialogContent). */
const DEFAULT_CLOSE_LABEL = "Close"

const DialogContext = React.createContext<{
  variant: DialogVariant
  showCloseButton: boolean
  closeLabel: string
  /** Set while the dialog is dirty: the corner Close asks through the discard bar instead of closing. */
  requestDiscard: (() => void) | null
}>({
  variant: "default",
  showCloseButton: true,
  closeLabel: DEFAULT_CLOSE_LABEL,
  requestDiscard: null,
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
  closeLabel = DEFAULT_CLOSE_LABEL,
  submitShortcut,
  discardLabels,
  onInteractOutside,
  onEscapeKeyDown,
  onKeyDown,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Defaults to true, except the confirm variant, which the mockup draws without one. */
  showCloseButton?: boolean
  variant?: DialogVariant
  size?: DialogSize
  /**
   * A form dialog the viewer has typed in (`dialog-guard.ts`, owner ruling 2026-10-08): an outside click is ignored, and Esc
   * or the corner Close shows the inline discard bar ("Discard changes?", Keep editing / Discard) in place of the footer.
   * Cancel still closes at once: it is deliberate. Esc while the bar shows means Keep editing.
   */
  dirty?: boolean
  /**
   * ⌘/Ctrl Enter submits the dialog's form (the one holding focus, else the first) as its default button would, from a
   * textarea or anywhere in the dialog. On by default; off by default in the `confirm` variant, so a destructive action
   * always takes a deliberate press of its named button. Nothing happens while the submit button is disabled.
   */
  submitShortcut?: boolean
  /** The discard bar's words in the app's language; English by default. */
  discardLabels?: Partial<DiscardLabels>
  /**
   * US-224: the accessible name of the header Close button and the text of the footer Close button, in the app's language
   * (`closeLabel={t("close")}`). A prop, like the Drawer's `closeLabel`, so the dialog needs no next-intl namespace; English
   * "Close" when omitted.
   */
  closeLabel?: string
}) {
  const withClose = showCloseButton ?? variant !== "confirm"
  const submitOn = submitShortcut ?? variant !== "confirm"
  const [asking, setAsking] = React.useState(false)
  const showBar = asking && dirty
  const returnFocus = React.useRef<HTMLElement | null>(null)
  const keepEditingRef = React.useRef<HTMLButtonElement>(null)
  const askDiscard = React.useCallback(() => {
    returnFocus.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAsking(true)
  }, [])
  const keepEditing = () => {
    setAsking(false)
    const target = returnFocus.current
    if (target && target.isConnected) target.focus()
  }
  // Keep editing takes focus when the bar appears (the least destructive choice, as in a confirm).
  React.useEffect(() => {
    if (showBar) keepEditingRef.current?.focus()
  }, [showBar])
  const requestDiscard = dirty ? askDiscard : null
  const context = React.useMemo(
    () => ({ variant, showCloseButton: withClose, closeLabel, requestDiscard }),
    [variant, withClose, closeLabel, requestDiscard]
  )
  const discardWords = { ...DISCARD_DEFAULT_LABELS, ...discardLabels }
  // Esc and every close return focus to the opener, with or without a DialogTrigger (v32 fix; return-focus.ts).
  const focusReturn = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        {...dialogRoleProps(variant)}
        {...MODAL_LAYER_PROPS}
        {...focusReturn}
        data-discarding={showBar ? "true" : undefined}
        className={cn(CONTENT_CLASS, size === "large" && CONTENT_LARGE_CLASS, className)}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          if (outsideInteractionDecision({ dirty }) === "prevent") event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event)
          if (event.defaultPrevented) return
          const decision = escapeKeyDecision({ dirty, asking: showBar })
          if (decision === "close") return
          event.preventDefault()
          if (decision === "keep-editing") keepEditing()
          else askDiscard()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          // Keys from a nested dialog (the discard confirmation) bubble here through the React tree; only this dialog's own count.
          if (event.defaultPrevented || !submitOn || !event.currentTarget.contains(event.target as Node)) return
          if (isComposing(event.nativeEvent) || !matchShortcut(event.nativeEvent, SHORTCUTS.submit)) return
          if (submitFromShortcut(formForShortcut(event.target, event.currentTarget))) event.preventDefault()
        }}
        {...props}
      >
        <DialogContext.Provider value={context}>{children}</DialogContext.Provider>
        {showBar ? (
          <DiscardBar labels={discardWords} keepEditingRef={keepEditingRef} onKeepEditing={keepEditing} />
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * The discard bar (owner ruling 2026-10-08): inside the dialog, in place of the footer, never a second dialog. A danger-tinted
 * band (the danger Alert's `danger-surface` and `danger-border`) with the question, Keep editing (outline, focused first) and
 * Discard (danger). The question is a `role="alert"` region, as the Alert spec uses for something that appears after an action,
 * so it is announced at once. Discard is a Radix Close, so it closes the dialog whether the app controls `open` or not.
 */
function DiscardBar({
  labels,
  keepEditingRef,
  onKeepEditing,
}: {
  labels: DiscardLabels
  keepEditingRef: React.RefObject<HTMLButtonElement | null>
  onKeepEditing: () => void
}) {
  return (
    <div data-slot="dialog-discard" className={DISCARD_BAR_CLASS}>
      <TriangleAlertIcon aria-hidden="true" className={DISCARD_ICON_CLASS} />
      <div role="alert" className={DISCARD_TEXT_CLASS}>
        <p className="m-0 text-body-strong text-ink">{labels.question}</p>
        {labels.description ? <p className="m-0 text-small text-ink">{labels.description}</p> : null}
      </div>
      <div className={DISCARD_ACTIONS_CLASS}>
        <Button ref={keepEditingRef} variant="outline" onClick={onKeepEditing}>
          {labels.keepEditing}
        </Button>
        <DialogPrimitive.Close asChild>
          <Button variant="danger" data-slot="dialog-discard-confirm">
            {labels.discard}
          </Button>
        </DialogPrimitive.Close>
      </div>
    </div>
  )
}

function DialogCloseButton({ label }: { label: string }) {
  const { requestDiscard } = React.useContext(DialogContext)
  return (
    <DialogPrimitive.Close data-slot="dialog-close" asChild>
      <Button
        variant="ghost"
        className={CLOSE_CLASS}
        size="icon-sm"
        onClick={(event) => {
          // The corner Close on a dirty dialog asks first (closeRequestDecision "ask"); Radix skips its close once prevented.
          if (requestDiscard && closeRequestDecision({ dirty: true, asking: false }, "close-button") === "ask") {
            event.preventDefault()
            requestDiscard()
          }
        }}
      >
        <XIcon aria-hidden="true" />
        <span className="sr-only">{label}</span>
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
  closeLabel,
  actions,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode
  /** One header action before Close (the ShortcutsSheet's "Help for this page"); an outline button, never a solid. */
  actions?: React.ReactNode
  /** Overrides DialogContent's `closeLabel` for this header's Close button. */
  closeLabel?: string
}) {
  const { variant, showCloseButton, closeLabel: contextLabel } = React.useContext(DialogContext)
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
      {actions ? (
        <div data-slot="dialog-header-actions" className="-mt-2 flex shrink-0 items-center gap-2">
          {actions}
          {showCloseButton ? <DialogCloseButton label={closeLabel ?? contextLabel} /> : null}
        </div>
      ) : showCloseButton ? (
        <DialogCloseButton label={closeLabel ?? contextLabel} />
      ) : null}
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

/**
 * A form section (Modal spec, "Form sections", ruled 2026-10-07): a `<section>` named by its `h3`, for a form with more than
 * one group of fields. Same props as DrawerSection: `title`, `accent` (the admin eyebrow in `accent-text` instead of the plain
 * `body-strong` `ink-secondary` sub-heading) and an optional `caption`. Sections after the first get one hairline above them.
 */
function DialogSection({
  className,
  title,
  accent = false,
  caption,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & { title: React.ReactNode; accent?: boolean; caption?: React.ReactNode }) {
  const id = React.useId()
  return (
    <section data-slot="dialog-section" aria-labelledby={id} className={cn(SECTION_CLASS, className)} {...props}>
      <div data-slot="dialog-section-head" className={SECTION_HEAD_CLASS}>
        <DialogSectionTitle id={id} accent={accent}>
          {title}
        </DialogSectionTitle>
        {caption ? <DialogSectionCaption>{caption}</DialogSectionCaption> : null}
      </div>
      {children}
    </section>
  )
}

/** A section's `h3`: the plain sub-heading, or with `accent` the admin eyebrow. Use it alone for a custom section layout. */
function DialogSectionTitle({ className, accent = false, ...props }: React.ComponentProps<"h3"> & { accent?: boolean }) {
  return (
    <h3
      data-slot="dialog-section-title"
      data-accent={accent ? "true" : undefined}
      className={cn(accent ? SECTION_TITLE_ACCENT_CLASS : SECTION_TITLE_CLASS, className)}
      {...props}
    />
  )
}

/** The optional caption under a section title: `small`, `ink-secondary`. */
function DialogSectionCaption({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="dialog-section-caption" className={cn(SECTION_CAPTION_CLASS, className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  /** Overrides DialogContent's `closeLabel` for this footer's Close button. */
  closeLabel?: string
}) {
  const { closeLabel: contextLabel } = React.useContext(DialogContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(FOOTER_CLASS, className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{closeLabel ?? contextLabel}</Button>
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
  DialogSection,
  DialogSectionCaption,
  DialogSectionTitle,
  DialogTitle,
  DialogTrigger,
}
