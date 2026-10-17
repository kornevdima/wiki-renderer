"use client";

import { ListTreeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OutlineEntry } from "@/content/render/types";

import { OnThisPage } from "./on-this-page";
import { revealScrollTop } from "./popover-scroll";

/**
 * US-282: "On this page" from a button beside search, for widths where the page rail's list is not shown (below 1200px; the
 * button is hidden from 1200px with the same breakpoint as `.wr-toc--rail`, and never prints). The installed DS Popover, modal,
 * aligned to the end, used as is. The caller mounts it only when `showsOutline(outline)`. The button is named by the existing
 * `onThisPage.title` message. On open, focus goes to the current entry (or the first) without scrolling the page, and the list is
 * scrolled so that entry is in view; choosing an entry pins it, jumps (the link's own hash) and closes.
 */
export function OutlinePopover({ outline }: { outline: readonly OutlineEntry[] }) {
  const t = useTranslations("onThisPage");
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  function onOpenAutoFocus(event: Event) {
    event.preventDefault();
    const root = contentRef.current;
    if (root === null) return;
    const list = root.querySelector<HTMLElement>(".wr-toc--popover > ul");
    const current = root.querySelector<HTMLElement>('a[aria-current="location"]');
    const target = current ?? root.querySelector<HTMLElement>("a");
    target?.focus({ preventScroll: true });
    if (list !== null && current !== null) {
      const l = list.getBoundingClientRect();
      const c = current.getBoundingClientRect();
      list.scrollTop = revealScrollTop({
        listTop: l.top,
        listHeight: list.clientHeight,
        itemTop: c.top,
        itemHeight: c.height,
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="outline-trigger"
          aria-label={t("title")}
          className="w-(--control-h-m) shrink-0 px-0 min-[1200px]:hidden print:hidden"
        >
          <ListTreeIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        collisionPadding={12}
        aria-labelledby="toc-title-popover"
        data-testid="outline-popover"
        className="wr-toc-pop w-[min(320px,calc(100vw-24px))] print:hidden"
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <OnThisPage outline={outline} variant="popover" onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
