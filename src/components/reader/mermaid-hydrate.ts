/**
 * Client-side Mermaid drawing (US-104, ADR-011, SR-007), the pure half of `MermaidHydrator` so its rules are
 * unit-testable without a browser. It never imports `mermaid` itself: the caller passes `load`, which is the one
 * dynamic import of the package (client component only, never on the server or under `src/content/**`).
 *
 * The contract, block by block (matched by `data-mermaid-id`, the placeholder the server emitted):
 * - Strict security level, always. `initialize` is called with `securityLevel: "strict"` and `startOnLoad: false`
 *   and nothing else that could lower it; Mermaid's default `secure` list stays, so an `%%{init}%%` directive in a
 *   diagram cannot change `securityLevel`.
 * - Each placeholder is drawn once per page view: a `data-mermaid-state` marker ("drawing", "drawn", "error") is set
 *   before the first `await` for that block, so a second pass (React strict-mode double effect, a re-run) skips it.
 * - Drawn: the SVG replaces the source `pre` and the server caption is removed; the placeholder keeps its attributes. The SVG is
 *   named (US-192, `mermaid-accessible-name.ts`): `role="img"` and an `aria-label` of the author's `accTitle`, else `diagramName`.
 * - Render error: that block shows the accepted error copy where the caption was, and its source stays below it.
 * - Chunk failure: nothing is touched. The placeholder keeps its caption and source, state "undrawn".
 * - Blocks are drawn one after another (Mermaid's `render` is not safe to interleave), and the returned promise
 *   resolves after all of them, never rejects (it is `mermaidReady`, DEP-017).
 */
import { nameDrawnDiagram, type SvgElementLike } from "./mermaid-accessible-name";

export interface MermaidLike {
  initialize(config: { startOnLoad: false; securityLevel: "strict"; suppressErrorRendering: true }): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

export interface MermaidBlockRef {
  id: string;
  source: string;
}

export interface HydrateOptions {
  root: ParentNode;
  blocks: readonly MermaidBlockRef[];
  load: () => Promise<MermaidLike>;
  errorText: string;
  /** The server caption's copy, rebuilt when a block is reset to source (R2-2). Omitted: the reset shows no caption. */
  captionText?: string;
  /** The generic accessible name of a drawn diagram that has no author title (the `mermaid.diagramName` copy, US-192). Omitted: the svg is not named. */
  diagramName?: string;
  isCancelled?: () => boolean;
  /** Called with a promise that settles when a block's draw (render and its DOM handling) is finished. Used by the queue. */
  track?: (done: Promise<void>) => void;
  /** Called by the queue when hydration starts, after any wait for a draw in flight (the client phase starts here). */
  onStart?: () => void;
}

export const MERMAID_STATE_ATTRIBUTE = "data-mermaid-state";

// The source each placeholder was last handled for (W2-16): a same-path refresh with changed content keeps the marker
// (React never writes it) but changes `data-mermaid-source`, and only this tells the two apart.
const handledSource = new WeakMap<Element, string>();

/** A placeholder whose children are stale (drawn for an older source): back to source only, ready to be drawn. */
function resetToSource(el: HTMLElement, source: string, captionText?: string): void {
  const doc = el.ownerDocument;
  const pre = doc.createElement("pre");
  const code = doc.createElement("code");
  code.textContent = source;
  pre.append(code);
  // R2-2: keep the server caption, so a redraw that fails at chunk load still says why this is source.
  if (captionText === undefined) el.replaceChildren(pre);
  else {
    const caption = doc.createElement("p");
    caption.setAttribute("data-mermaid-caption", "");
    caption.textContent = captionText;
    el.replaceChildren(caption, pre);
  }
  el.removeAttribute(MERMAID_STATE_ATTRIBUTE);
}

function placeholderFor(root: ParentNode, id: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>("[data-mermaid-id]")) {
    if (el.getAttribute("data-mermaid-id") === id) return el;
  }
  return null;
}

function showError(el: HTMLElement, errorText: string): void {
  const doc = el.ownerDocument;
  const caption = el.querySelector("[data-mermaid-caption]");
  const message = doc.createElement("p");
  message.setAttribute("data-mermaid-error", "");
  message.textContent = errorText;
  if (caption) caption.replaceWith(message);
  else el.prepend(message);
}

function showDrawn(el: HTMLElement, svg: string, diagramName?: string): void {
  // Inert parse first: nothing in a `template` runs or loads. Mermaid's strict level has already sanitised `svg`.
  const template = el.ownerDocument.createElement("template");
  template.innerHTML = svg;
  // US-192: name the drawn svg (an image named by the author's accTitle, else the generic name) before it is attached.
  if (diagramName !== undefined) {
    const drawn = template.content.querySelector("svg");
    if (drawn) nameDrawnDiagram(drawn as unknown as SvgElementLike, diagramName);
  }
  el.replaceChildren(template.content);
}

export async function hydrateMermaid(options: HydrateOptions): Promise<void> {
  const { root, blocks, load, errorText, captionText, diagramName, isCancelled, track } = options;
  const pending = blocks
    .map((block) => ({ block, el: placeholderFor(root, block.id) }))
    .filter((p): p is { block: MermaidBlockRef; el: HTMLElement } => {
      if (p.el === null) return false;
      const state = p.el.getAttribute(MERMAID_STATE_ATTRIBUTE);
      if (state === null || state === "drawing") return state === null;
      if (handledSource.get(p.el) === p.block.source) return false;
      if (state !== "undrawn") resetToSource(p.el, p.block.source, captionText);
      else p.el.removeAttribute(MERMAID_STATE_ATTRIBUTE);
      return true;
    });
  if (pending.length === 0) return;

  let mermaid: MermaidLike;
  try {
    mermaid = await load();
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true });
  } catch {
    for (const { el } of pending) el.setAttribute(MERMAID_STATE_ATTRIBUTE, "undrawn");
    return;
  }

  for (const { block, el } of pending) {
    if (isCancelled?.() || el.hasAttribute(MERMAID_STATE_ATTRIBUTE) || !el.isConnected) continue;
    el.setAttribute(MERMAID_STATE_ATTRIBUTE, "drawing");
    handledSource.set(el, block.source);
    let finished: () => void = () => undefined;
    if (track) track(new Promise<void>((r) => (finished = r)));
    try {
      const { svg } = await mermaid.render(block.id, block.source);
      if (isCancelled?.() || !el.isConnected) {
        // W2-17: a cancelled view leaves the block unmarked so the next effect draws it.
        if (el.getAttribute(MERMAID_STATE_ATTRIBUTE) === "drawing") el.removeAttribute(MERMAID_STATE_ATTRIBUTE);
        continue;
      }
      showDrawn(el, svg, diagramName);
      el.setAttribute(MERMAID_STATE_ATTRIBUTE, "drawn");
    } catch {
      if (isCancelled?.() || !el.isConnected) {
        if (el.getAttribute(MERMAID_STATE_ATTRIBUTE) === "drawing") el.removeAttribute(MERMAID_STATE_ATTRIBUTE);
        continue;
      }
      // Mermaid can leave its scratch element (`d<id>`) in the body after a failed parse.
      el.ownerDocument.getElementById(`d${block.id}`)?.remove();
      showError(el, errorText);
      el.setAttribute(MERMAID_STATE_ATTRIBUTE, "error");
    } finally {
      finished();
    }
  }
}

/**
 * R2-1: a view that starts while the previous view is mid-draw waits for that one draw to finish (the previous view was
 * cancelled, so it unmarks the block it was drawing) before it looks for blocks to draw; otherwise it would skip the block
 * as "drawing" and the old run's unmark would leave it as source. It waits only for a draw in flight, never for the
 * previous view's `load()`, and a view with no diagram does not wait at all: a stalled Mermaid chunk on one page never keeps
 * the next page pending (Save as PDF follows the new page alone). Draws never interleave: the wait covers the one in
 * flight, and a cancelled view starts no further one. Never rejects.
 */
export function createHydrationQueue(): (options: HydrateOptions) => Promise<void> {
  let inFlight: Promise<void> = Promise.resolve();
  return async (options) => {
    if (options.blocks.length > 0) {
      let seen: Promise<void>;
      do {
        seen = inFlight;
        await seen;
      } while (seen !== inFlight);
    }
    options.onStart?.();
    return hydrateMermaid({
      ...options,
      track: (done) => {
        inFlight = done;
        options.track?.(done);
      },
    });
  };
}
