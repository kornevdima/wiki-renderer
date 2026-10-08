"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import type { OutlineEntry } from "@/content/render/types";

import { groupOutline } from "./outline-tree";
import { getCurrentSection, getServerSection, pinSection, subscribeSection } from "./section-spy-store";

/**
 * The "On this page" list (US-219, FR-053, SA-MOD Reader UI and print E3-2, E3-D5). The caller renders it only when
 * `showsOutline(outline)`; there is no empty state here. It exists in two server-rendered copies and CSS shows one: `rail` in the
 * page rail from 1200px (a `nav` named by its visible title) and `folded` under the meta line below it (a closed native
 * `<details>` named by its summary, not Radix). `display: none` takes the hidden copy out of the accessibility tree and the tab
 * order. Both read the one current id from the section store, so they never disagree.
 *
 * Entries are plain `<a href="#<id>">` (they jump without script; the id is the one the heading, its anchor and a wikilink share).
 * The current entry has `aria-current="location"`, the selection wash and bold (`wr-reader.css`), so colour is never the only
 * cue. A click marks its entry at once and holds it until the reader next scrolls (`pinSection`). Neither copy prints.
 */
export function OnThisPage({ outline, variant }: { outline: readonly OutlineEntry[]; variant: "rail" | "folded" }) {
  const t = useTranslations("onThisPage");
  const current = useSyncExternalStore(subscribeSection, getCurrentSection, getServerSection);
  const link = (entry: OutlineEntry) => (
    <a
      href={`#${entry.id}`}
      aria-current={current === entry.id ? "location" : undefined}
      data-toc={entry.id}
      onClick={() => pinSection(entry.id)}
    >
      {entry.text}
    </a>
  );
  const list = (
    <ul>
      {groupOutline(outline).map((group) => (
        <li key={group.entry.id}>
          {link(group.entry)}
          {group.children.length > 0 ? <ul>{group.children.map((child) => <li key={child.id}>{link(child)}</li>)}</ul> : null}
        </li>
      ))}
    </ul>
  );

  if (variant === "folded") {
    return (
      <details className="wr-toc wr-toc--inline print:hidden" data-testid="toc-inline">
        <summary>{t("title")}</summary>
        {list}
      </details>
    );
  }
  return (
    <nav className="wr-toc wr-toc--rail print:hidden" aria-labelledby="toc-title-rail" data-testid="toc-rail">
      <p className="wr-toc__title" id="toc-title-rail">
        {t("title")}
      </p>
      {list}
    </nav>
  );
}
