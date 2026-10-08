/**
 * US-176 (NFR-009 via CR-006): the skip link is the root layout's first element, and every `<main>` in `src/` carries the
 * `#main` target. A screen that adds a `<main>` without `MAIN_REGION` fails here, naming the file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MAIN_REGION, MAIN_REGION_ID, PAGE_CONTENT_CLASS, PAGE_STACK_CLASS, SKIP_LINK_ID } from "./main-region";
import { SkipLink } from "./skip-link";

const SRC = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) acc.push(full);
  }
  return acc;
}

describe("the main region", () => {
  it("is #main and focusable by script only (tabindex -1), so the skip link moves focus without adding a tab stop", () => {
    expect(MAIN_REGION).toEqual({ id: "main", tabIndex: -1 });
    expect(MAIN_REGION_ID).toBe("main");
  });

  it("every <main> in src/ spreads MAIN_REGION", () => {
    const missing: string[] = [];
    let total = 0;
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const opens = text.match(/<main\b/g)?.length ?? 0;
      const spreads = text.match(/<main \{\.\.\.MAIN_REGION\}/g)?.length ?? 0;
      total += opens;
      if (opens !== spreads) missing.push(file.replace(SRC, ""));
    }
    // A scan-found-something floor; US-178 folded three bare-state mains into AuthColumn.
    expect(total).toBeGreaterThanOrEqual(4);
    expect(missing).toEqual([]);
  });

  it("the page gutter is on the content column (it also keeps a focus ring off the window edge)", () => {
    expect(PAGE_CONTENT_CLASS).toMatch(/\bpx-4\b/);
    expect(PAGE_CONTENT_CLASS).toMatch(/\blg:p-8\b/);
    expect(PAGE_CONTENT_CLASS).toContain("max-w-(--content-max)");
  });
});

describe("column sizing (320px)", () => {
  it("the content column and a page stack are minmax(0,1fr), so a select's intrinsic width can't widen them", () => {
    expect(PAGE_CONTENT_CLASS).toContain("grid-cols-[minmax(0,1fr)]");
    expect(PAGE_STACK_CLASS).toContain("grid-cols-[minmax(0,1fr)]");
    expect(SKIP_LINK_ID).toBe("skip-link");
  });
});

describe("the skip link", () => {
  it("is an anchor to #main with the label it is given, hidden until focused, and not printed", () => {
    const html = renderToStaticMarkup(createElement(SkipLink, { label: "Skip to content" }));
    expect(html).toMatch(/^<a id="skip-link" href="#main"/);
    expect(html).toContain(">Skip to content</a>");
    expect(html).toContain("-translate-y-[200%]");
    expect(html).toContain("focus:translate-y-0");
    expect(html).toContain("print:hidden");
    expect(html).not.toContain("tabindex");
  });

  it("is the first element in the root layout's body, before anything focusable", () => {
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    const body = layout.slice(layout.indexOf("<body>"));
    expect(body.indexOf("<SkipLink")).toBeGreaterThan(-1);
    expect(body.indexOf("<SkipLink")).toBeLessThan(body.indexOf("<NonceBridge"));
    expect(body.indexOf("<SkipLink")).toBeLessThan(body.indexOf("{children}"));
    expect(layout).toContain('getTranslations("skipLink")');
  });

  it("the topbar and the shell render nothing before it: neither is mounted in the root layout", () => {
    const layout = readFileSync(join(SRC, "app", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/Topbar|AppShell/);
  });
});
