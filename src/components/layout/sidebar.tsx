"use client";

import Link from "next/link";
import { ChevronDownIcon, PanelLeftCloseIcon } from "lucide-react";
import { createContext, useContext, useId, useState, type ComponentType, type ReactNode, type SVGProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The admin Sidebar (spec: project/components/Sidebar): the brand at `topbar-h`, captioned groups of links with an optional
 * count, and a footer (settings, help, the collapse button) above a rule. `surface-muted`; items are `small` in `ink-secondary`,
 * hover is `hover-overlay` with `ink`, and the current item is `surface-selected` with bold `primary-text` and
 * `aria-current="page"` (the brand book's one way to mark the current place).
 *
 * It fills the `AppShell` sidebar slot (full width and height of the column; the shell draws the right edge and, below
 * `bp-lg`, makes it the off-canvas drawer). Standalone, pass `edge` to draw the spec's own right hairline.
 *
 * Collapsed (`collapsed`) is icons only at `bp-lg` and up: labels, captions and counts are visually hidden but stay in the
 * accessible name, each item carries a `title` ("Vacancies, 12"), and groups are divided by rules. Below `bp-lg` the sidebar is
 * the drawer and always shows labels. The viewer's preference is the app's to store; the column width is the shell's.
 *
 * A group may be `collapsible` (opt-in, ruled 2026-10-07): its caption becomes a disclosure button with a chevron, the list
 * stays mounted behind `hidden`, and the group holding the current page (`containsCurrent`) opens. With the sidebar collapsed
 * to icons a group is never a disclosure.
 */
interface SidebarState {
  collapsed: boolean;
}

const SidebarContext = createContext<SidebarState>({ collapsed: false });
/** True inside a `SidebarGroup`'s list, where an item renders its own `<li>`. */
const ListContext = createContext(false);

export const SIDEBAR_CLASS = "flex h-full min-h-0 w-full flex-col bg-surface-muted text-ink";
export const SIDEBAR_EDGE_CLASS = "border-e border-border";

/** `sr-only` only while collapsed, and only where the sidebar is static (`bp-lg` and up). */
export const COLLAPSED_HIDDEN_CLASS =
  "lg:absolute lg:-m-px lg:size-px lg:overflow-hidden lg:border-0 lg:p-0 lg:whitespace-nowrap lg:[clip:rect(0,0,0,0)]";

export const ITEM_CLASS =
  "flex min-h-(--control-h-m) w-full cursor-pointer items-center gap-3 rounded-(--ds-radius-md) border-0 bg-transparent px-3 py-2 text-left text-small text-ink-secondary no-underline " +
  "transition-[background-color,color] duration-(--duration-base) ease-(--ease-base) motion-reduce:transition-none " +
  "not-aria-disabled:not-aria-[current=page]:hover:bg-hover-overlay not-aria-disabled:not-aria-[current=page]:hover:text-ink focus-visible:outline-solid focus-visible:-outline-offset-2 " +
  "aria-[current=page]:bg-surface-selected aria-[current=page]:font-bold aria-[current=page]:text-primary-text " +
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled)";
export const ITEM_COLLAPSED_CLASS = "lg:justify-center lg:p-2";

export const ICON_CLASS = "size-(--icon-control) flex-none";
export const LABEL_CLASS = "min-w-0 flex-1 truncate";
export const COUNT_CLASS =
  "inline-flex min-w-(--avatar-xs) flex-none items-center justify-center rounded-(--ds-radius-sm) border border-border bg-surface px-2 text-label font-normal text-ink-secondary tabular-nums " +
  "group-aria-[current=page]/item:border-transparent group-aria-[current=page]/item:text-primary-text";

export const CAPTION_CLASS = "m-0 px-3 text-eyebrow text-ink-secondary uppercase";
/** A collapsible group's caption: the caption's type and colour on a full-width disclosure button, with the item's hover and focus. */
export const CAPTION_TOGGLE_CLASS =
  "flex min-h-(--space-32) w-full cursor-pointer items-center gap-2 rounded-(--ds-radius-md) border-0 bg-transparent py-2 text-left " +
  "transition-[background-color,color] duration-(--duration-base) ease-(--ease-base) motion-reduce:transition-none " +
  "hover:bg-hover-overlay hover:text-ink focus-visible:outline-solid focus-visible:-outline-offset-2";
/** The disclosure chevron: `icon-ui`, pointing down when open and right when closed; it turns only where motion is allowed. */
export const CHEVRON_CLASS =
  "size-(--icon-ui) flex-none motion-safe:transition-transform motion-safe:duration-(--duration-fast) motion-safe:ease-standard";
export const CHEVRON_CLOSED_CLASS = "-rotate-90";
export const LIST_CLASS = "m-0 grid list-none gap-1 p-0";
export const NAV_CLASS = "grid min-h-0 flex-auto content-start gap-6 overflow-y-auto px-4 pt-2 pb-4";
export const NAV_COLLAPSED_CLASS = "lg:px-3";
export const GROUP_CLASS = "grid gap-2";
export const GROUP_COLLAPSED_CLASS = "lg:[&+&]:border-t lg:[&+&]:border-border lg:[&+&]:pt-4";
export const FOOTER_CLASS = "grid flex-none gap-1 border-t border-border p-4";
export const BRAND_CLASS =
  "flex h-(--topbar-h) flex-none items-center gap-3 rounded-(--ds-radius-md) px-6 text-ink no-underline focus-visible:outline-solid focus-visible:-outline-offset-2";

/** The `title` of a collapsed item: its label, and its count after a comma ("Vacancies, 12"), as the spec's collapsed state. */
export function collapsedTitle(label: string, count?: number | string | null): string {
  return count === undefined || count === null || count === "" ? label : `${label}, ${count}`;
}

export interface SidebarProps {
  /** The product name ("Recruitment"): the `aside`'s accessible name. */
  label: string;
  collapsed?: boolean;
  /** Draw the spec's right hairline. Off by default: inside `AppShell` the column draws it. */
  edge?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Sidebar({ label, collapsed = false, edge = false, className, children }: SidebarProps) {
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <aside
        aria-label={label}
        data-slot="sidebar"
        data-collapsed={collapsed}
        className={cn(SIDEBAR_CLASS, edge && SIDEBAR_EDGE_CLASS, className)}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}

export interface SidebarBrandProps {
  href?: string;
  /** "EasySoftGroup". */
  company: string;
  /** The product name under it ("Recruitment"). */
  product: string;
  /** The logo mark; by default the ESG mark at `logo-mark-sm` (the same PNG as `Brand`, served from `public/`). */
  logo?: ReactNode;
}

export function SidebarBrand({ href = "/", company, product, logo }: SidebarBrandProps) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <Link
      href={href}
      data-slot="sidebar-brand"
      title={collapsed ? `${company} ${product}` : undefined}
      className={cn(BRAND_CLASS, collapsed && "lg:justify-center lg:px-0")}
    >
      {logo ?? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image writes style="color:transparent" into server HTML, which a strict nonce CSP (style-src without 'unsafe-inline') refuses; this fixed-size PNG from public/ needs no optimisation
        <img src="/esg-logo-mark.png" alt="" width={36} height={36} className="size-(--logo-mark-sm) flex-none" />
      )}
      <span className={cn("grid min-w-0", collapsed && COLLAPSED_HIDDEN_CLASS)}>
        <span className="text-body-strong whitespace-nowrap text-ink">{company}</span>
        <span className="text-caption whitespace-nowrap text-ink-secondary">{product}</span>
      </span>
    </Link>
  );
}

export interface SidebarNavProps {
  /** The nav's accessible name; the spec's is "Main". */
  label?: string;
  children?: ReactNode;
}

export function SidebarNav({ label = "Main", children }: SidebarNavProps) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <nav aria-label={label} data-slot="sidebar-nav" className={cn(NAV_CLASS, collapsed && NAV_COLLAPSED_CLASS)}>
      {children}
    </nav>
  );
}

/**
 * Whether a collapsible group shows its list: the group holding the current page while it is still pinned open (until the
 * viewer presses the caption), else the controlled `open`, else the group's own state.
 */
export function groupOpen({ containsCurrent, pinned, open, own }: { containsCurrent: boolean; pinned: boolean; open?: boolean; own: boolean }): boolean {
  return (containsCurrent && pinned) || (open ?? own);
}

export interface SidebarGroupProps {
  /** The group caption ("Hiring"); it names the list (`aria-labelledby`). */
  caption: string;
  /**
   * Make the caption a disclosure button that opens and closes the list. Off by default: a plain captioned list. Closed
   * lists stay mounted (`hidden`), so their links stay in the DOM. Ignored while the sidebar is collapsed to icons.
   */
  collapsible?: boolean;
  /** Uncontrolled: whether a collapsible group starts open. Defaults to open. */
  defaultOpen?: boolean;
  /** Controlled: whether a collapsible group is open. Pair it with `onOpenChange`. */
  open?: boolean;
  /** Called with the next open state when the caption is pressed. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The group holds the current page (one of its items is `current`). A collapsible group then renders open on its first
   * render, and opens again whenever the current page moves into it, whatever `defaultOpen` or `open` say, so the current
   * place is never hidden. The viewer can still close it afterwards.
   */
  containsCurrent?: boolean;
  children?: ReactNode;
}

export function SidebarGroup({
  caption,
  collapsible = false,
  defaultOpen = true,
  open,
  onOpenChange,
  containsCurrent = false,
  children,
}: SidebarGroupProps) {
  const { collapsed } = useContext(SidebarContext);
  const id = useId();
  const listId = `${id}-list`;
  const [ownOpen, setOwnOpen] = useState(defaultOpen || containsCurrent);
  // "Pinned" holds the group open for the current page until the viewer presses the caption.
  const [pinned, setPinned] = useState(containsCurrent);
  const [hadCurrent, setHadCurrent] = useState(containsCurrent);
  if (containsCurrent !== hadCurrent) {
    // The current page moved into (or out of) this group: adjust during render, so the list never paints closed first.
    setHadCurrent(containsCurrent);
    if (containsCurrent) {
      setPinned(true);
      setOwnOpen(true);
    }
  }

  const disclosure = collapsible && !collapsed;
  const expanded = !disclosure || groupOpen({ containsCurrent, pinned, open, own: ownOpen });

  function toggle() {
    const next = !expanded;
    setPinned(false);
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div
      data-slot="sidebar-group"
      data-state={disclosure ? (expanded ? "open" : "closed") : undefined}
      className={cn(GROUP_CLASS, collapsed && GROUP_COLLAPSED_CLASS)}
    >
      {disclosure ? (
        <button
          type="button"
          id={id}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={toggle}
          className={cn(CAPTION_CLASS, CAPTION_TOGGLE_CLASS)}
        >
          <span className={LABEL_CLASS}>{caption}</span>
          <ChevronDownIcon aria-hidden="true" strokeWidth={1.5} className={cn(CHEVRON_CLASS, !expanded && CHEVRON_CLOSED_CLASS)} />
        </button>
      ) : (
        <p id={id} className={cn(CAPTION_CLASS, collapsed && COLLAPSED_HIDDEN_CLASS)}>
          {caption}
        </p>
      )}
      <ul id={collapsible ? listId : undefined} aria-labelledby={id} hidden={!expanded} className={LIST_CLASS}>
        <ListContext.Provider value={true}>{children}</ListContext.Provider>
      </ul>
    </div>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface SidebarItemProps {
  /** A Lucide icon component (`BriefcaseIcon`); drawn at `icon-control`, 1.5px stroke. */
  icon: Icon;
  label: string;
  /** A link item. Without `href` the item is a `<button>` (`onClick`). */
  href?: string;
  onClick?: () => void;
  /** A neutral count chip, part of the link text ("Vacancies 12"). Never a status colour. */
  count?: number | string;
  /** The current page: `aria-current="page"`. Mark exactly one item. */
  current?: boolean;
  disabled?: boolean;
}

function ItemContent({ icon: IconComponent, label, count, collapsed }: { icon: Icon; label: string; count?: number | string; collapsed: boolean }) {
  return (
    <>
      <IconComponent aria-hidden="true" strokeWidth={1.5} className={ICON_CLASS} />
      <span className={cn(LABEL_CLASS, collapsed && COLLAPSED_HIDDEN_CLASS)}>{label}</span>
      {count === undefined ? null : (
        <span data-slot="sidebar-count" className={cn(COUNT_CLASS, collapsed && COLLAPSED_HIDDEN_CLASS)}>
          {count}
        </span>
      )}
    </>
  );
}

export function SidebarItem({ icon, label, href, onClick, count, current = false, disabled = false }: SidebarItemProps) {
  const { collapsed } = useContext(SidebarContext);
  const inList = useContext(ListContext);
  const className = cn("group/item", ITEM_CLASS, collapsed && ITEM_COLLAPSED_CLASS);
  const title = collapsed ? collapsedTitle(label, count) : undefined;
  const content = <ItemContent icon={icon} label={label} count={count} collapsed={collapsed} />;

  let item: ReactNode;
  if (disabled) {
    // A disabled link has no href, so it is not a tab stop and does nothing; it is still announced, as disabled.
    item = href ? (
      <a role="link" aria-disabled="true" title={title} className={className}>
        {content}
      </a>
    ) : (
      <button type="button" aria-disabled="true" title={title} className={className}>
        {content}
      </button>
    );
  } else if (href) {
    item = (
      <Link href={href} aria-current={current ? "page" : undefined} title={title} className={className}>
        {content}
      </Link>
    );
  } else {
    item = (
      <button type="button" aria-current={current ? "page" : undefined} title={title} onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return inList ? <li>{item}</li> : item;
}

export function SidebarFooter({ children }: { children?: ReactNode }) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <div data-slot="sidebar-footer" className={cn(FOOTER_CLASS, collapsed && "lg:px-3")}>
      {children}
    </div>
  );
}

export interface SidebarCollapseButtonProps {
  onToggle: () => void;
  /** Spec copy: "Collapse sidebar" / "Expand sidebar". */
  collapseLabel?: string;
  expandLabel?: string;
}

/**
 * The collapse button: a real `<button>` with `aria-pressed` (pressed = collapsed) whose label switches between "Collapse
 * sidebar" and "Expand sidebar". It only collapses where the sidebar is static, so it is hidden below `bp-lg`.
 */
export function SidebarCollapseButton({ onToggle, collapseLabel = "Collapse sidebar", expandLabel = "Expand sidebar" }: SidebarCollapseButtonProps) {
  const { collapsed } = useContext(SidebarContext);
  const label = collapsed ? expandLabel : collapseLabel;
  return (
    <button
      type="button"
      data-slot="sidebar-collapse"
      aria-pressed={collapsed}
      title={collapsed ? label : undefined}
      onClick={onToggle}
      className={cn(ITEM_CLASS, collapsed && ITEM_COLLAPSED_CLASS, "max-lg:hidden")}
    >
      <PanelLeftCloseIcon
        aria-hidden="true"
        strokeWidth={1.5}
        className={cn(ICON_CLASS, "motion-safe:transition-transform motion-safe:duration-(--duration-fast) motion-safe:ease-standard", collapsed && "rotate-180")}
      />
      <span className={cn(LABEL_CLASS, collapsed && COLLAPSED_HIDDEN_CLASS)}>{label}</span>
    </button>
  );
}
