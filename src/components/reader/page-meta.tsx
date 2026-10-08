import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/ui/status-badge";
import { TRUNCATED } from "@/content/render/frontmatter-view";
import type { FrontmatterField } from "@/content/render/types";
import { formatDate, monthNamesFrom } from "@/lib/format-date";

import { buildPageMeta } from "./page-meta-model";
import { CHIP } from "./tag-chip-classes";

/**
 * The page meta line (US-220, FR-023 via CR-008, SA-MOD Reader UI and print E3-5): the curated face of the frontmatter, under
 * the page's h1 and inside `<main>`. A server component built by `buildPageMeta` from the render's bounded `frontmatterView`:
 * the status as the installed `StatusBadge`, "Updated" or "Created" with a date in the FR-051 format, and the tags as chips.
 * Every part is React text (escaped). A missing part is left out; with none, nothing is rendered, not even an empty element.
 * It is a `div` of spans, not a `p` of lists: the article's unlayered rules for `p`, `ul` and `li` (`wr-prose.css`)
 * would restyle them, and tag chips need no list markup beyond the roles. It prints with the page.
 */
export function PageMeta({ fields }: { fields: readonly FrontmatterField[] | undefined }) {
  const t = useTranslations("pageMeta");
  const tDates = useTranslations("dates");
  const meta = buildPageMeta(fields);
  if (meta === null) return null;

  return (
    <div data-testid="page-meta" className="wr-meta text-sm leading-5 text-muted-foreground">
      {meta.status ? (
        <StatusBadge variant={meta.status.variant} className="min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]">
          {meta.status.word}
        </StatusBadge>
      ) : null}
      {meta.date ? (
        <span>
          {`${t(meta.date.kind)} `}<time dateTime={meta.date.iso}>{formatDate(meta.date.date, monthNamesFrom(tDates))}</time>
        </span>
      ) : null}
      {meta.tags ? (
        <>
          <span role="list" aria-label={t("tags")} className="flex min-w-0 flex-wrap gap-(--gap-tags)">
            {meta.tags.chips.map((chip, index) => (
              <span key={index} role="listitem" className={CHIP}>
                {chip}
              </span>
            ))}
          </span>
          {meta.tags.truncated ? <span>{TRUNCATED}</span> : null}
        </>
      ) : null}
    </div>
  );
}
