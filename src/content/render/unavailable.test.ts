/**
 * US-081 unit specs (contract U1 to U4, U6; TC-216, TC-456, TC-211 regression), through `renderPage` with a real `LinkMap`.
 * U5 (click leaves the URL unchanged) and E1 are e2e.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLinkMap } from "@/content/links/link-map";
import type { FileEntry, WikiSnapshot } from "@/content/runtime/types";
import { parsePages } from "./parse";
import { renderPage } from "./render";
import { resetRenderCacheForTests } from "./render-cache.testing";
import { UNAVAILABLE_CLASS_TOKENS, unavailableMarker } from "./unavailable";
import { EMBED_CLASS_TOKENS } from "./embed";
import { UNAVAILABLE_LABEL, UNAVAILABLE_TOOLTIP } from "./wikilink-copy";

const enc = new TextEncoder();
let n = 0;
function html(body: string, extra: Record<string, string> = {}): string {
  const files = new Map<string, FileEntry>(
    Object.entries({ ...extra, "p.md": body }).map(([p, t]) => [p, { bytes: enc.encode(t), contentType: "x" }]),
  );
  const pages = parsePages(files);
  const sha = `sha${n++}`;
  const snapshot: WikiSnapshot = { wikiId: "w", sha, files, pages, linkMap: buildLinkMap(pages, files, "w", sha), searchIndexJson: "", tree: [] };
  const r = renderPage(snapshot, "p.md");
  if ("state" in r) throw new Error("unavailable");
  return renderToStaticMarkup(r.content);
}
beforeEach(() => resetRenderCacheForTests());

const MARKER = /<span class="wikilink-unavailable"[^>]*>.*?<\/span><\/span>/g;
const DUPS = { "a/Dup.md": "#", "b/Dup.md": "#" };

describe("copy (R-7, verbatim)", () => {
  it("is the accepted text", () => {
    expect(UNAVAILABLE_LABEL).toBe("unavailable link");
    expect(UNAVAILABLE_TOOLTIP).toBe("This link has no target in this wiki.");
  });
});

describe("U1: the marker shape (TC-456)", () => {
  it("[[Missing]] is one non-focusable, non-link element with the text, an aria-hidden indicator and hidden text", () => {
    const out = html("[[Missing]]");
    expect(out).toBe(
      '<p><span class="wikilink-unavailable" title="This link has no target in this wiki.">Missing' +
        '<span class="wikilink-unavailable-indicator" aria-hidden="true"></span>' +
        '<span class="wikilink-unavailable-text">unavailable link</span></span></p>',
    );
    expect(out).not.toMatch(/<a[\s>]/);
    expect(out).not.toContain("href");
    expect(out).not.toMatch(/tabindex/i);
    expect(out).not.toContain("role=");
    expect(out).not.toContain("aria-label");
    expect(out).not.toContain("<svg");
  });
  it("the factory takes only the visible text: there is no reason to vary on", () => {
    expect(unavailableMarker.length).toBe(1);
  });
});

describe("U2: one shape whatever the reason (TC-216, SR-020)", () => {
  it("not-found, ambiguous and a missing embed are identical apart from the visible text", () => {
    const shapes = [html("[[Nope]]", DUPS), html("[[Dup]]", DUPS), html("![[Nope2]]", DUPS)].map((out) => {
      const found = out.match(MARKER);
      expect(found).toHaveLength(1);
      return found![0]!.replace(/>(Nope2?|Dup)</, ">TEXT<");
    });
    expect(shapes[0]).toContain(">TEXT<");
    expect(shapes[1]).toBe(shapes[0]);
    expect(shapes[2]).toBe(shapes[0]);
  });
  it("an ambiguous embed is the same marker as a missing one", () => {
    const a = html("![[Dup]]", DUPS).match(MARKER)![0]!.replace("Dup", "X");
    const b = html("![[Nope]]", DUPS).match(MARKER)![0]!.replace("Nope", "X");
    expect(a).toBe(b);
  });
  it("a traversal-shaped target is the same marker too", () => {
    const a = html("[[../../etc/passwd]]", DUPS).match(MARKER)![0]!.replace("../../etc/passwd", "X");
    const b = html("[[Nope]]", DUPS).match(MARKER)![0]!.replace("Nope", "X");
    expect(a).toBe(b);
  });
});

describe("U3: TC-211 regression", () => {
  it("[[Missing Note|text]] leaks the target nowhere", () => {
    const out = html("[[Missing Note|text]] and ![[Gone Note|shown]]");
    expect(out).not.toMatch(/Missing Note|Gone Note/);
    expect(out).toContain(">text<");
    expect(out).toContain(">shown<");
  });
});

describe("U4: the classes are the trusted steps' alone", () => {
  it("every marker and embed class an author writes is removed", () => {
    for (const cls of [...UNAVAILABLE_CLASS_TOKENS, ...EMBED_CLASS_TOKENS]) {
      const out = html(`<span class="${cls}">s</span><div class="${cls} keep">d</div>`);
      expect(out, cls).not.toContain(cls);
      expect(out, cls).toContain("d</div>");
    }
  });
  it("the indicator class specifically (the aria-hidden indicator cannot be forged)", () => {
    const out = html('<span class="wikilink-unavailable-indicator" aria-hidden="true">x</span>');
    expect(out).toBe("<p><span>x</span></p>");
  });
  it("lists all three marker classes", () => {
    expect([...UNAVAILABLE_CLASS_TOKENS]).toEqual(["wikilink-unavailable", "wikilink-unavailable-indicator", "wikilink-unavailable-text"]);
  });
});

describe("U6: nothing unresolved becomes a link", () => {
  it("every unresolved wikilink and embed renders the page with a marker and no href", () => {
    const body = ["[[Nope]]", "![[Nope]]", "[[Dup]]", "![[Dup]]", "[[../../x]]", "[[/abs]]", "[[a/b/c]]"].join("\n\n");
    const out = html(body, DUPS);
    expect(out.match(MARKER)).toHaveLength(7);
    expect(out).not.toContain("href");
  });
});
