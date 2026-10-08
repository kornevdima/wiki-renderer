/**
 * Component spec for `Panel` (US-176), rendered with `renderToStaticMarkup`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Panel, type PanelProps } from "./panel";

const render = (props: PanelProps, body = "Body") => renderToStaticMarkup(createElement(Panel, props, body));

describe("Panel", () => {
  it("is a section named by its title through titleId", () => {
    const html = render({ title: "Linked wikis", titleId: "project-wikis-heading" });
    expect(html).toMatch(/<section[^>]*aria-labelledby="project-wikis-heading"/);
    expect(html).toMatch(/<h2 id="project-wikis-heading"[^>]*>Linked wikis<\/h2>/);
  });

  it("passes a test id through", () => {
    expect(render({ title: "T", titleId: "t", "data-testid": "project-detail-wikis" } as PanelProps)).toContain('data-testid="project-detail-wikis"');
  });

  it("can take an h3", () => {
    expect(render({ title: "T", titleId: "t", titleLevel: 3 })).toMatch(/<h3 id="t"/);
  });

  it("without a title or actions it renders no head, and no aria-labelledby", () => {
    const html = render({});
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("aria-labelledby");
    expect(html).toContain("Body");
  });

  it("renders meta, actions and a foot over a divider", () => {
    const html = render({ title: "T", titleId: "t", meta: "Meta line", actions: "Act", footer: "Foot" });
    expect(html).toContain("Meta line");
    expect(html).toContain("Act");
    expect(html).toMatch(/border-t[^>]*>Foot</);
  });

  it("is flat: a hairline border and no shadow", () => {
    const html = render({ title: "T", titleId: "t" });
    expect(html).toContain("border border-border");
    expect(html).not.toContain("shadow");
  });

  it("muted and flush change the surface and the padding", () => {
    expect(render({ muted: true })).toContain("bg-muted");
    expect(render({})).toContain("bg-background");
    expect(render({ flush: true })).toContain("overflow-hidden");
    expect(render({})).toContain("p-6");
  });

  it("US-212 R2: with no children there is no body element, so no extra row and gap", () => {
    const html = renderToStaticMarkup(createElement(Panel, { title: "T", titleId: "t", footer: "Foot" }));
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)] gap-4");
    expect(html).toContain("Foot");
    expect(renderToStaticMarkup(createElement(Panel, { title: "T", titleId: "t" }, null, false))).not.toMatch(/<div class="grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-4"/);
    expect(render({ title: "T", titleId: "t" })).toContain("Body");
  });

  it("US-212 R4: a flush Panel takes its table edge to edge, with no gap between its children", () => {
    const html = render({ flush: true });
    expect(html).toContain("[&amp;_[data-slot=table-container]]:rounded-none");
    expect(html).toContain("[&amp;_[data-slot=table-container]]:border-x-0");
    expect(html).toMatch(/<div class="grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-0">Body/);
  });
});
