import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";
import messages from "../../../messages/en.json";

/**
 * Obsidian callouts (US-073, FR-026, TR-037; SA-MOD Rendering pipeline `callouts.ts`, Amendment 2026-09-30). A
 * blockquote whose first line is `[!type]` becomes
 *
 *   <div class="callout callout-<type>" role="alert|note">
 *     <div class="callout-title"><span class="callout-icon" aria-hidden="true"></span>title inline content</div>
 *     ...body children...
 *   </div>
 *
 * Trusted step: runs after `rehypeStripAuthorAttrs` (so `role` and every callout class name here was written by this
 * module, never by an author) and before the sanitiser, whose schema admits exactly these values (`sanitize-schema.ts`).
 *
 * The type text is untrusted. It selects a class name and a role only through the fixed `CALLOUT_TYPES` table (an own
 * lookup in a `Map`, so `__proto__` / `constructor` are just unknown types). An unknown type gets `callout-default`
 * and `role="note"`; its text reaches the output only as the title's text node (capitalised), which the serialiser
 * escapes. It never enters a class name or an attribute (TC-207).
 *
 * Marker grammar (W3-4): `[!type]`, optional `-` or `+` (consumed; the callout is always expanded, no fold control),
 * optional title text on the same line. Type matching is case-insensitive. A blockquote whose first line is not a
 * marker is left as a blockquote. Nested: `> > [!note]` leaves the outer blockquote alone and turns the inner one
 * into a callout; a marker line inside a callout body becomes a nested callout. The match is one anchored regex with
 * no nested quantifier, so it is linear in the first text node.
 */
export const CALLOUT_TYPES = ["note", "info", "tip", "warning", "danger", "success", "important"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const ALERT_TYPES: ReadonlySet<string> = new Set(["warning", "danger"]);
const TITLES: ReadonlyMap<string, string> = new Map(Object.entries(messages.callouts.titles));

export const CALLOUT_CLASS = "callout";
export const CALLOUT_TITLE_CLASS = "callout-title";
export const CALLOUT_ICON_CLASS = "callout-icon";
export const CALLOUT_DEFAULT_CLASS = "callout-default";
/** Every class name this module emits (the schema and `rehypeStripAuthorAttrs` both derive from this one list). */
export const CALLOUT_CONTAINER_CLASSES: readonly string[] = [
  CALLOUT_CLASS,
  ...CALLOUT_TYPES.map((t) => `callout-${t}`),
  CALLOUT_DEFAULT_CLASS,
];
export const CALLOUT_CLASS_TOKENS: readonly string[] = [...CALLOUT_CONTAINER_CLASSES, CALLOUT_TITLE_CLASS, CALLOUT_ICON_CLASS];
export const CALLOUT_ROLES: readonly string[] = ["alert", "note"];

const MARKER = /^\[!([^\]\n]+)\][+-]?[ \t]*/;

function capitalise(s: string): string {
  const first = String.fromCodePoint(s.codePointAt(0) ?? 0x20);
  return first.toUpperCase() + s.slice(first.length);
}

function isBlank(n: ElementContent): boolean {
  return n.type === "text" && n.value.trim() === "";
}

/** Splits a paragraph's children (after the marker was stripped from the first text node) at the first line end. */
function splitFirstLine(children: ElementContent[]): { title: ElementContent[]; rest: ElementContent[] } {
  const title: ElementContent[] = [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i]!;
    if (c.type === "text") {
      const nl = c.value.indexOf("\n");
      if (nl === -1) {
        title.push(c);
        continue;
      }
      if (nl > 0) title.push({ type: "text", value: c.value.slice(0, nl) });
      const tail = c.value.slice(nl + 1);
      return { title, rest: [...(tail ? [{ type: "text", value: tail } as ElementContent] : []), ...children.slice(i + 1)] };
    }
    if (c.type === "element" && c.tagName === "br") return { title, rest: children.slice(i + 1) };
    title.push(c);
  }
  return { title, rest: [] };
}

function trimEdges(nodes: ElementContent[]): ElementContent[] {
  const out = nodes.slice();
  const first = out[0];
  if (first?.type === "text") {
    const v = first.value.trimStart();
    if (v) out[0] = { type: "text", value: v };
    else out.shift();
  }
  const last = out[out.length - 1];
  if (last?.type === "text") {
    const v = last.value.trimEnd();
    if (v) out[out.length - 1] = { type: "text", value: v };
    else out.pop();
  }
  return out;
}

function toCallout(node: Element): void {
  if (node.tagName !== "blockquote") return;
  const firstIdx = node.children.findIndex((c) => !isBlank(c));
  const p = node.children[firstIdx];
  if (p?.type !== "element" || p.tagName !== "p") return;
  const lead = p.children[0];
  if (lead?.type !== "text") return;
  const m = MARKER.exec(lead.value);
  if (!m) return;

  const typeText = m[1]!.trim();
  if (!typeText) return;
  const key = typeText.toLowerCase();
  const known = (CALLOUT_TYPES as readonly string[]).includes(key);
  const after: ElementContent[] = [{ type: "text", value: lead.value.slice(m[0].length) }, ...p.children.slice(1)];
  const { title, rest } = splitFirstLine(after);
  const titleNodes = trimEdges(title);
  const restNodes = trimEdges(rest);

  const titleContent: ElementContent[] = titleNodes.length
    ? titleNodes
    : [{ type: "text", value: known ? TITLES.get(key)! : capitalise(typeText) }];
  const body: ElementContent[] = [
    ...(restNodes.length ? [{ type: "element", tagName: "p", properties: {}, children: restNodes } as Element] : []),
    ...node.children.slice(firstIdx + 1).filter((c, i, a) => !(isBlank(c) && (i === 0 || i === a.length - 1))),
  ];

  node.tagName = "div";
  node.properties = {
    className: [CALLOUT_CLASS, known ? `callout-${key}` : CALLOUT_DEFAULT_CLASS],
    role: known && ALERT_TYPES.has(key) ? "alert" : "note",
  };
  node.children = [
    {
      type: "element",
      tagName: "div",
      properties: { className: [CALLOUT_TITLE_CLASS] },
      children: [
        { type: "element", tagName: "span", properties: { className: [CALLOUT_ICON_CLASS], ariaHidden: "true" }, children: [] },
        ...titleContent,
      ],
    },
    ...body,
  ];
}

export function rehypeCallouts() {
  return (tree: Root): void => {
    // Pre-order: the node is converted in place, then its children (the body, where a nested marker may sit) are visited.
    visit(tree, "element", (node: Element) => {
      toCallout(node);
    });
  };
}
