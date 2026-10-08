"use client";

import { Command } from "cmdk";
import { FileTextIcon, HashIcon, SearchIcon, XIcon } from "lucide-react";
import type MiniSearch from "minisearch";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { useAppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { loadSearchIndex, peekSearchIndex, querySearchIndex, SEARCH_QUERY_MAX, searchResultHref, type SearchRow } from "@/content/search/client";
import type { SearchDoc } from "@/content/search/types";

import { focusResultTarget } from "./focus-after-result";
import { highlightSegments } from "./search-highlight";
import { folderSegments } from "./search-result-path";
import {
  formatResultCount,
  isApplePlatform,
  isModifiedClick,
  OPEN_POPUP_SELECTOR,
  searchViewState,
  shouldOpenOnShortcut,
  splitEmptyTitle,
  type SearchPhase,
  type SearchViewState,
} from "./search-view-model";

/**
 * The reader's search trigger and dialog (SA-MOD Reader UI and print S7-R1, SA-MOD Search §3; US-091, US-092; FR-041,
 * FR-043). The trigger is a "Search" button in the reader header; Ctrl+K and Cmd+K open it from anywhere in the reader shell
 * (US-222, E3-D10: one `keydown` listener on `document`, ignored while the dialog or the drawer is open). The index is fetched on the
 * FIRST open only (D2): `SearchPanel` mounts inside the dialog content, which Radix renders only while open, and its
 * mount effect asks the module-scope loader, which caches by wiki and sha. Querying is client-side with cmdk's own
 * filtering off, so the MiniSearch rows are the list (D3). Titles and headings render as React text only (D6).
 *
 * Prop-driven copy like `LocaleSwitcher`: `PageShell` resolves `search.*` and passes it down.
 */
export interface SearchCopy {
  trigger: string;
  triggerLabel: string;
  dialogTitle: string;
  inputLabel: string;
  inputPlaceholder: string;
  idle: string;
  loading: string;
  failed: string;
  /** The no-results title, containing `{query}` (kept raw: the query is substituted as React text). */
  empty: string;
  emptyText: string;
  /** The trigger's shortcut hint on an Apple platform, and elsewhere. */
  shortcutApple: string;
  shortcutOther: string;
  /** The results listbox's accessible name (cmdk's default is "Suggestions"). */
  listLabel: string;
  resultCountOne: string;
  /** Contains `{count}`. */
  resultCountOther: string;
  close: string;
}

export interface SearchCommandDialogProps {
  wikiId: string;
  /** The page's snapshot sha, from the page's single snapshot read. */
  sha: string;
  copy: SearchCopy;
}

/**
 * US-193 (NFR-013): the search dialog's placement, as a class override on `DialogContent` only (no shared Dialog variant).
 * The mockup's `dialog.esg-modal.wr-search` pins it near the top (`margin: 10vh auto auto`) with `max-height: 80vh`, and under
 * 600px a space-8 top margin with `max-height: calc(100vh - space-16)`; the width is the kit's `--modal-w` (560px) with the
 * 16px side margin `CONTENT_CLASS` already gives. The height cap stays, so the results list (not the dialog) scrolls.
 * Written as the cap and the offset together so a unit test can pin them.
 */
export const SEARCH_DIALOG_CLASS =
  "top-[10vh] max-h-[80vh] translate-y-0 gap-0 p-0 max-[599.98px]:top-2 max-[599.98px]:max-h-[calc(100vh-1rem)]";

const noopSubscribe = () => () => {};

/**
 * The shortcut hint's text, chosen after mount: the server snapshot and the first client render are `null`, so the server HTML is
 * platform-neutral and hydration cannot mismatch (as `PdfBrowserHint` does).
 */
function useShortcutHint(copy: SearchCopy): string | null {
  const apple = useSyncExternalStore(
    noopSubscribe,
    () => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      return isApplePlatform(nav.userAgentData?.platform || nav.platform || nav.userAgent);
    },
    () => null,
  );
  return apple === null ? null : apple ? copy.shortcutApple : copy.shortcutOther;
}

export function SearchCommandDialog({ wikiId, sha, copy }: SearchCommandDialogProps) {
  const [open, setOpen] = useState(false);
  const drawerOpen = useAppShell()?.open ?? false;
  const hint = useShortcutHint(copy);
  // The listener reads the latest state through a ref, so it is added once and a held key cannot stack dialogs.
  const gate = useRef({ dialogOpen: open, drawerOpen });
  useEffect(() => {
    gate.current = { dialogOpen: open, drawerOpen };
  }, [open, drawerOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const popupOpen = document.querySelector(OPEN_POPUP_SELECTOR) !== null;
      if (!shouldOpenOnShortcut(event, { ...gate.current, popupOpen })) return;
      event.preventDefault();
      gate.current = { ...gate.current, dialogOpen: true };
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  // Set when the dialog closes because a result was chosen: focus then goes to the result's target, not the trigger.
  const resultChosen = useRef(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="search-trigger"
          aria-label={copy.triggerLabel}
          aria-keyshortcuts="Control+K Meta+K"
          className="min-w-0 justify-start font-normal max-md:w-(--control-h-m) max-md:justify-center max-md:px-0 md:w-70 print:hidden"
        >
          <SearchIcon aria-hidden="true" />
          <span className="text-muted-foreground max-md:sr-only">{copy.trigger}</span>
          {hint === null ? null : (
            <kbd
              aria-hidden="true"
              data-testid="search-shortcut-hint"
              className="ms-auto rounded-(--ds-radius-sm) border border-border px-1 font-sans text-xs font-normal text-muted-foreground tabular-nums max-md:hidden print:hidden"
            >
              {hint}
            </kbd>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className={SEARCH_DIALOG_CLASS}
        data-testid="search-dialog"
        onCloseAutoFocus={(event) => {
          if (resultChosen.current) {
            resultChosen.current = false;
            event.preventDefault();
          }
        }}
      >
        <SearchDialogBody copy={copy}>
          <SearchPanel wikiId={wikiId} sha={sha} copy={copy} onNavigated={() => {
              resultChosen.current = true;
              setOpen(false);
            }} />
        </SearchDialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dialog's inside. The input (in `children`) comes BEFORE the close control in the DOM, so Radix's FocusScope, which
 * focuses the first tabbable element on open, lands on the input (D7); the close button is absolutely positioned, so
 * the order is not visible. Escape and focus-return-to-trigger are Radix defaults, left alone.
 */
export function SearchDialogBody({ copy, children }: { copy: SearchCopy; children: ReactNode }) {
  return (
    <>
      <DialogTitle className="sr-only">{copy.dialogTitle}</DialogTitle>
      {children}
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copy.close}
          className="absolute top-2 right-2 size-(--control-h-m) text-muted-foreground hover:text-foreground"
          data-testid="search-close"
        >
          <XIcon aria-hidden="true" className="size-(--icon-control)" />
        </Button>
      </DialogClose>
    </>
  );
}

function SearchPanel({ wikiId, sha, copy, onNavigated }: SearchCommandDialogProps & { onNavigated: () => void }) {
  const router = useRouter();
  // A re-open with the index already loaded starts ready: no flash of the loading copy.
  const [cached] = useState(() => peekSearchIndex(wikiId, sha));
  const [phase, setPhase] = useState<SearchPhase>(cached ? "ready" : "loading");
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(cached ?? null);
  const [query, setQuery] = useState("");
  const skipSelect = useRef(false);

  useEffect(() => {
    let live = true;
    loadSearchIndex(wikiId, sha).then(
      (loaded) => {
        if (!live) return;
        setIndex(loaded);
        setPhase("ready");
      },
      () => {
        if (live) setPhase("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [wikiId, sha]);

  const rows = useMemo(() => (index === null ? [] : querySearchIndex(index, query)), [index, query]);

  return (
    <SearchPanelView
      wikiId={wikiId}
      copy={copy}
      phase={phase}
      query={query}
      rows={rows}
      onQueryChange={setQuery}
      onLinkClick={(event) => {
        // A plain click is handled by `onSelect` (client navigation keeps the cached index); a modified click is the
        // browser's own (new tab), so `onSelect` must not also navigate.
        // The flag is cleared on the next task, so it covers only this click's `onSelect` and never a later Enter.
        if (isModifiedClick(event)) {
          skipSelect.current = true;
          setTimeout(() => {
            skipSelect.current = false;
          }, 0);
        } else event.preventDefault();
      }}
      onSelectRow={(href) => {
        if (skipSelect.current) {
          skipSelect.current = false;
          return;
        }
        router.push(href);
        onNavigated();
        focusResultTarget(href);
      }}
    />
  );
}

export interface SearchPanelViewProps {
  wikiId: string;
  copy: SearchCopy;
  phase: SearchPhase;
  query: string;
  rows: SearchRow[];
  onQueryChange?: (query: string) => void;
  onLinkClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onSelectRow?: (href: string) => void;
}

const MESSAGE_FOR: Record<Exclude<SearchViewState, "results">, keyof SearchCopy> = {
  failed: "failed",
  loading: "loading",
  idle: "idle",
  empty: "empty",
};

const INPUT_CLASS =
  "box-border h-(--control-h-s) min-w-0 flex-1 rounded-t-(--ds-radius-lg) border-0 bg-transparent pr-[calc(var(--control-h-m)+1rem)] pl-[calc(1.5rem+var(--icon-control)+0.75rem)] text-foreground placeholder:text-ink-muted focus-visible:outline-offset-[-2px]";
const LIST_CLASS = "min-h-0 flex-1 overflow-y-auto px-2 pb-2 [&_[cmdk-list-sizer]]:grid [&_[cmdk-list-sizer]]:gap-0.5";
// The highlighted row (cmdk's `data-selected`, set on the link because the item renders `asChild`): the selected surface, and
// the title in the link colour and bold. Hover shades only a row that is not highlighted, so the two never fight.
const ITEM_CLASS =
  "group flex items-start gap-3 rounded-(--ds-radius-md) px-3 py-2 text-foreground no-underline not-data-[selected=true]:hover:bg-hover-overlay data-[selected=true]:bg-surface-selected";
const PATH_LEAF_CLASS = "min-w-0 truncate [flex-shrink:0.1]";
const ROW_ICON_CLASS = "mt-0.5 size-(--icon-ui) flex-none text-muted-foreground";
const MESSAGE_CLASS = "mx-4 my-6 text-center text-sm text-muted-foreground";

/** The presentational half: everything it shows follows from its props (so it is unit-tested with static markup). */
export function SearchPanelView({ wikiId, copy, phase, query, rows, onQueryChange, onLinkClick, onSelectRow }: SearchPanelViewProps) {
  const state = searchViewState({ phase, query, rowCount: rows.length });
  // cmdk 1.1.1 hard-codes `aria-expanded="true"` AFTER spreading the props it is given, so a prop cannot override it (measured
  // 2026-10-07). The attribute is set on the element instead, true only while the result list shows (US-222, E3-7).
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = state === "results";
  useLayoutEffect(() => {
    inputRef.current?.setAttribute("aria-expanded", String(expanded));
  }, [expanded]);
  const shownQuery = query.trim().slice(0, SEARCH_QUERY_MAX).trim();
  const emptyTitle = splitEmptyTitle(copy.empty);
  return (
    <Command label={copy.inputLabel} shouldFilter={false} loop className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex flex-none items-center border-b">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-6 size-(--icon-control) text-ink-muted" />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={onQueryChange}
          placeholder={copy.inputPlaceholder}
          data-testid="search-input"
          className={INPUT_CLASS}
        />
      </div>
      {state === "results" ? (
        <p role="status" aria-live="polite" className="mx-5 mt-4 mb-2 text-xs text-muted-foreground" data-testid="search-count">
          {formatResultCount({ one: copy.resultCountOne, other: copy.resultCountOther }, rows.length)}
        </p>
      ) : null}
      {/* BUG-037: cmdk always points the input's `aria-controls` at the list's id, so the list stays mounted in every state.
          Outside the results state it is `hidden` (no layout, out of the accessibility tree, so no empty-listbox finding) and
          empty, which keeps the reference valid. It carries the `search-results` hook only while it shows results. */}
      <Command.List
        label={copy.listLabel}
        hidden={state !== "results"}
        data-testid={state === "results" ? "search-results" : undefined}
        className={LIST_CLASS}
      >
        {state === "results"
          ? rows.map((row) => {
              const href = searchResultHref(wikiId, row);
              const RowIcon = row.heading !== "" ? HashIcon : FileTextIcon;
              return (
                <Command.Item key={row.id} value={row.id} asChild onSelect={() => onSelectRow?.(href)}>
                  <a href={href} onClick={onLinkClick} className={ITEM_CLASS} data-testid="search-result">
                    <RowIcon aria-hidden="true" className={ROW_ICON_CLASS} />
                    <span className="grid min-w-0">
                      <span className="block text-sm [overflow-wrap:anywhere] group-data-[selected=true]:font-bold group-data-[selected=true]:text-primary-text" data-testid="search-result-title">
                        <Highlighted text={row.title} terms={row.terms} />
                      </span>
                      {row.heading !== "" ? (
                        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="search-result-heading">
                          <Highlighted text={row.heading} terms={row.terms} />
                        </span>
                      ) : null}
                      <ResultPath path={row.path} />
                    </span>
                  </a>
                </Command.Item>
              );
            })
          : null}
      </Command.List>
      {state === "results" ? null : state === "failed" ? (
        <Alert variant="danger" className="m-2" data-testid="search-failed">
          {copy.failed}
        </Alert>
      ) : state === "empty" ? (
        <EmptyState
          size="compact"
          role="status"
          data-testid="search-empty"
          icon={<SearchIcon />}
          title={
            <>
              {emptyTitle.before}
              {shownQuery}
              {emptyTitle.after}
            </>
          }
          titleClassName="[overflow-wrap:anywhere]"
          text={copy.emptyText}
          className="min-w-0"
        />
      ) : (
        <p role="status" className={MESSAGE_CLASS} data-testid={`search-${state}`}>
          {copy[MESSAGE_FOR[state]]}
        </p>
      )}
    </Command>
  );
}

/** A title or heading with its matched words in `<mark class="wr-search__match">`: React segments, never an HTML string (D6, TC-517). */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((segment, i) =>
        segment.match ? (
          <mark key={i} className="wr-search__match">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * The result's folder, "deliverables › architecture": one truncated line, the leaf folder shrinking least. The separator is
 * `aria-hidden`; a page at the wiki root has no folders, so no line at all. Whitespace text nodes between the flex items keep the
 * text readable as "a › b" without adding layout (TC-518).
 */
export function ResultPath({ path }: { path: string }) {
  const folders = folderSegments(path);
  if (folders.length === 0) return null;
  return (
    <span className="flex min-w-0 overflow-hidden text-xs whitespace-nowrap text-muted-foreground" data-testid="search-result-path">
      {folders.map((folder, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              {" "}
              <span aria-hidden="true" className="flex-none px-1">
                ›
              </span>{" "}
            </>
          ) : null}
          <span className={i === folders.length - 1 ? PATH_LEAF_CLASS : "min-w-0 truncate"}>{folder}</span>
        </Fragment>
      ))}
    </span>
  );
}
