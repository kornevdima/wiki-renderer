"use client"

import * as React from "react"
import { CircleCheckIcon, InfoIcon, OctagonAlertIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Toast } from "radix-ui"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { BODY_CLASS, CLOSE_CLASS, CONTENT_CLASS, ICON_CLASS, TEXT_CLASS, TITLE_CLASS, TOAST_CLASS, VARIANT_ICON_CLASS, VIEWPORT_CLASS } from "./toast-classes"
import { createPauseGate, createToastQueue, type ToastInput, type ToastItem, type ToastQueue, type ToastVariant } from "./toast-queue"

/**
 * US-202 (NFR-013; ADR-019): the design system's Toast on Radix Toast, with the cap of three and the per-variant timing in
 * the pure queue (`toast-queue.ts`; Radix gets `duration={Infinity}`). One `Toaster` is mounted in the admin layout; screens
 * raise a toast through `useToast()` (US-182). The viewport is polite. A danger toast is `role="alert"` and announced
 * assertively (`type="foreground"`); the others are `role="status"` announced politely (`type="background"`).
 */
const ICONS = { neutral: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, danger: OctagonAlertIcon } as const

/** The role a toast of this variant carries. */
export function toastRole(variant: ToastVariant): "alert" | "status" {
  return variant === "danger" ? "alert" : "status"
}

const ToastContext = React.createContext<ToastQueue | null>(null)

/** Raises and dismisses toasts. Throws outside a `Toaster`. */
export function useToast(): { toast: (input: ToastInput) => string; dismiss: (id: string) => void } {
  const queue = React.useContext(ToastContext)
  if (!queue) throw new Error("useToast must be used inside a Toaster")
  return React.useMemo(() => ({ toast: queue.push, dismiss: queue.dismiss }), [queue])
}

/** One toast, for the static markup tests and the live list. */
export function ToastView({ item, dismissLabel, onDismiss }: { item: ToastItem; dismissLabel: string; onDismiss: (id: string) => void }) {
  const Icon = ICONS[item.variant]
  const queue = React.useContext(ToastContext)
  const gate = React.useMemo(() => (queue ? createPauseGate(queue, item.id) : null), [queue, item.id])
  return (
    <Toast.Root
      asChild
      type={item.variant === "danger" ? "foreground" : "background"}
      duration={Infinity}
      open
      onOpenChange={(open) => {
        if (!open) onDismiss(item.id)
      }}
      onPointerEnter={() => gate?.pointer(true)}
      onPointerLeave={() => gate?.pointer(false)}
      onFocus={() => gate?.focus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) gate?.focus(false)
      }}
    >
      {/* The item stays a real list item of the viewport's <ol> (BUG-031: Radix's own role="status" on the <li> left the list
          holding non-list children, axe `list`). The status or alert role sits on the element inside it. */}
      <li role="listitem" data-slot="toast" data-variant={item.variant} className={TOAST_CLASS}>
        {/* aria-live="off" keeps what Radix's own <li> had: Radix's hidden announcer (polite, or assertive for a foreground
            toast) is the one announcement per toast, so this role must not announce a second time. */}
        <div role={toastRole(item.variant)} aria-live="off" aria-atomic="true" data-slot="toast-content" className={CONTENT_CLASS}>
          <Icon aria-hidden="true" className={cn(ICON_CLASS, VARIANT_ICON_CLASS[item.variant])} />
          <div className={BODY_CLASS}>
            <Toast.Title className={TITLE_CLASS}>{item.title}</Toast.Title>
            {item.text ? <Toast.Description className={TEXT_CLASS}>{item.text}</Toast.Description> : null}
          </div>
          <Toast.Close aria-label={dismissLabel} className={CLOSE_CLASS}>
            <XIcon aria-hidden="true" className="size-(--icon-control)" />
          </Toast.Close>
        </div>
      </li>
    </Toast.Root>
  )
}

export function ToastList({ items, notificationsLabel, dismissLabel, onDismiss }: { items: readonly ToastItem[]; notificationsLabel: string; dismissLabel: string; onDismiss: (id: string) => void }) {
  return (
    <>
      {items.map((item) => (
        <ToastView key={item.id} item={item} dismissLabel={dismissLabel} onDismiss={onDismiss} />
      ))}
      <Toast.Viewport label={notificationsLabel} aria-live="polite" className={VIEWPORT_CLASS} />
    </>
  )
}

/** The provider and the one viewport. Mount once, in the admin layout. */
export function Toaster({ children }: { children: React.ReactNode }) {
  const t = useTranslations("toast")
  const [queue] = React.useState(() => createToastQueue())
  React.useEffect(() => () => queue.dispose(), [queue])
  const items = React.useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
  return (
    <ToastContext.Provider value={queue}>
      <Toast.Provider label={t("notifications")} swipeDirection="right" duration={Infinity}>
        {children}
        <ToastList items={items} notificationsLabel={t("notifications")} dismissLabel={t("dismiss")} onDismiss={queue.dismiss} />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
