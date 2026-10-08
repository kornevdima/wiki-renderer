import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NotFoundView } from "./not-found-view";

const html = renderToStaticMarkup(
  createElement(NotFoundView, {
    brand: { company: "The Firm", product: "wiki-renderer" },
    heading: "Page not found",
    description: "The page you're looking for doesn't exist.",
    homeLabel: "Back to wiki-renderer",
  }),
);

describe("US-178 — NotFoundView", () => {
  it("is the page's one main (test id not-found) with the search icon, the h1, the text and no header", () => {
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('data-testid="not-found"');
    expect(html).toContain("lucide-search");
    expect(html).toMatch(/<h1 data-slot="empty-state-title"[^>]*>Page not found<\/h1>/);
    expect(html).toContain("The page you&#x27;re looking for doesn&#x27;t exist.");
    expect(html).not.toContain("<header");
  });

  it("is a full EmptyState in a flush Panel", () => {
    expect(html).toContain('data-size="full"');
    expect(html).toContain('data-slot="panel"');
  });

  it("has one outline 'Back to wiki-renderer' link to /, and the brand lockup links to / too", () => {
    expect(html).toMatch(/<a [^>]*data-variant="outline"[^>]*href="\/"[^>]*>Back to wiki-renderer<\/a>|<a [^>]*href="\/"[^>]*data-variant="outline"[^>]*>Back to wiki-renderer<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*data-testid="brand"|<a [^>]*data-testid="brand"[^>]*href="\/"/);
  });

  it("is the same markup for every caller: nothing in it depends on the path", () => {
    expect(html).not.toContain("admin");
  });
});
