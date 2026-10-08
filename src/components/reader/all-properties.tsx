import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

import { isLinkedText, TRUNCATED, type LinkedText } from "@/content/render/frontmatter-view";
import { unavailableMarker } from "@/content/render/unavailable";
import type { FrontmatterField } from "@/content/render/types";

import { isLiteralValue } from "./frontmatter-literal";
import { propertyRows } from "./all-properties-model";
import { tagChips } from "./frontmatter-tags";
import { CHIP, CHIPS } from "./tag-chip-classes";

/**
 * All properties (US-220, FR-023 via CR-008, SA-MOD Reader UI and print E3-5; it replaces the Properties panel of US-108 and
 * US-188). A React server component: not part of the Markdown pipeline and never through the sanitiser. Every key and value is
 * React text (escaped); nothing here uses raw-HTML injection, an id, or a `tabindex`.
 *
 * A native `<details data-testid="frontmatter-panel" class="wr-properties">`, closed by default: no `open` attribute is ever
 * rendered. The summary reads "All properties" with the number of rows listed (`propertyRows`); then a `dl` of every top-level
 * key with its value, in source order, with no key filtered for any reader. It opens in print and in a saved PDF through CSS
 * (`::details-content` in `wr-reader.css`), not script. It lives in the page rail (`<aside aria-label="Page details">`, outside
 * `<main>`); it is not a landmark itself and adds no heading. The "Properties" eyebrow is gone.
 *
 * Look: the bordered disclosure and the key/value rows are `wr-reader.css`; keys, IDs and recorded dates are Lilex
 * (`wr-literal`, `isLiteralValue`) and page titles stay in the body face. A nested list is indented behind a hairline; `tags`
 * shows as chips (`tagChips`, the same chips as the meta line); wikilinks keep the link colour and the unavailable marker its
 * muted dotted underline.
 *
 * The input is `frontmatterView` as US-071 built it (bounded, `(truncated)` markers inline). A cut key list ends in a
 * sentinel field that `propertyRows` turns into a visible mark after the list. No fields, no disclosure.
 */
export interface AllPropertiesProps {
  fields: FrontmatterField[];
}

/**
 * A string value that held wikilinks (US-160): tokens built on the server by the body's own resolver. A link is a React
 * `a` whose href came from that resolver; the unavailable marker is the body's `unavailableMarker` element, converted,
 * so the shape and the copy (US-081) are the same. Everything else is escaped React text.
 */
function Linked({ value }: { value: LinkedText }): ReactNode {
  return (
    <span>
      {value.tokens.map((token, index) => {
        if (token.kind === "link") {
          return (
            <a key={index} href={token.href} className="wikilink text-primary-text underline underline-offset-2">
              {token.text}
            </a>
          );
        }
        if (token.kind === "unavailable") {
          return <Fragment key={index}>{toJsxRuntime(unavailableMarker(token.text), { Fragment, jsx, jsxs })}</Fragment>;
        }
        return <Fragment key={index}>{token.text}</Fragment>;
      })}
    </span>
  );
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

const LIST = "m-0 grid list-none gap-0.5 p-0";
const NESTED_LIST = `${LIST} border-l border-border pl-3`;

function Value({ value, emptyLabel, nested = false }: { value: unknown; emptyLabel: string; nested?: boolean }): ReactNode {
  if (isLinkedText(value)) return <Linked value={value} />;
  if (isEmptyValue(value)) return <span className="italic text-muted-foreground">{emptyLabel}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className={nested ? NESTED_LIST : LIST}>
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} emptyLabel={emptyLabel} nested />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <ul className={nested ? NESTED_LIST : LIST}>
        {Object.entries(value as Record<string, unknown>).map(([key, item], index) => (
          <li key={index}>
            <span className="wr-literal">{key}</span>: <Value value={item} emptyLabel={emptyLabel} nested />
          </li>
        ))}
      </ul>
    );
  }
  const text = String(value);
  return <span className={isLiteralValue(text) ? "wr-literal" : undefined}>{text}</span>;
}

export function AllProperties({ fields }: AllPropertiesProps) {
  const t = useTranslations("allProperties");
  if (fields.length === 0) return null;
  const { rows, count, truncated } = propertyRows(fields);

  return (
    <details data-testid="frontmatter-panel" className="wr-properties min-w-0">
      <summary className="text-sm leading-5">
        {t("title")}
        <span className="wr-properties__count text-xs leading-4">{count}</span>
      </summary>
      <dl className="m-0 grid">
        {rows.map((field, index) => {
          const tags = tagChips(field.key, field.value);
          return (
            <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 border-b border-border py-3 last:border-b-0">
              <dt className="wr-literal m-0 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{field.key}</dt>
              <dd className="m-0 min-w-0 text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
                {tags !== null ? (
                  <>
                    <ul className={CHIPS}>
                      {tags.chips.map((chip, chipIndex) => (
                        <li key={chipIndex} className={CHIP}>
                          {chip}
                        </li>
                      ))}
                    </ul>
                    {tags.truncated ? <span>{TRUNCATED}</span> : null}
                  </>
                ) : (
                  <Value value={field.value} emptyLabel={t("empty")} />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {truncated ? <p className="m-0 pb-3 text-sm leading-5 text-muted-foreground">{TRUNCATED}</p> : null}
    </details>
  );
}
