import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { PdfBrowserHint } from "./pdf-browser-hint";
import { PageShell } from "./page-shell";
import { SaveAsPdfButton } from "./save-as-pdf-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/" }));

const COPY = { button: "Save as PDF", preparing: "Preparing diagrams..." };
const button = (diagramCount: number) => renderToStaticMarkup(createElement(SaveAsPdfButton, { diagramCount, viewKey: "k", copy: COPY }));

describe("copy: the accepted strings, verbatim (R-12)", () => {
  it("messages/en.json pdf.* equals the accepted copy", () => {
    expect(messages.pdf).toEqual({
      button: "Save as PDF",
      preparing: "Preparing diagrams...",
      chromeHint: "For the best PDF, use Chrome.",
    });
  });
});

describe("SaveAsPdfButton server render (TC-480, TC-482)", () => {
  it("a page with diagrams renders pending: label unchanged, aria-disabled, status text tied by aria-describedby", () => {
    const html = button(2);
    expect(html).toContain(">Save as PDF</button>");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toMatch(/aria-describedby="([^"]+)"/);
    const id = /aria-describedby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Preparing diagrams...");
    expect(html).not.toMatch(/ disabled[ =>]/);
  });
  it("a page with no diagram is never pending", () => {
    const html = button(0);
    expect(html).toContain(">Save as PDF</button>");
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("Preparing diagrams...");
    expect(html).not.toContain('role="status"');
  });
  it("is hidden in print", () => {
    expect(button(0)).toContain("print:hidden");
  });
});

describe("PdfBrowserHint server render (TC-485)", () => {
  it("emits nothing during server rendering, so hydration cannot mismatch", () => {
    expect(renderToStaticMarkup(createElement(PdfBrowserHint, { text: "For the best PDF, use Chrome." }))).toBe("");
  });
});

describe("PageShell wiring (D1)", () => {
  const shell = (diagramCount?: number) =>
    renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        children: createElement(PageShell, { wikiId: "w1", wiki: { name: "Guide" }, sha: "a".repeat(40), tree: [], activePath: "a.md", diagramCount, children: "body" }),
      }),
    );
  it("puts Save as PDF in the page bar's actions, pending when the page has diagrams, and hides the bar in print", () => {
    const html = shell(1);
    const bar = /<div class="([^"]*)" data-testid="reader-pagebar">([\s\S]*?)<\/div><div class="(?:grid|min-w-0|wr-layout)/.exec(html)!;
    expect(bar[1]).toContain("wr-pagebar");
    expect(bar[1]).toContain("print:hidden");
    const actions = /data-testid="reader-page-actions">([\s\S]*)$/.exec(bar[2]!)![1]!;
    expect(actions).toContain("Save as PDF</button>");
    expect(actions).toContain('aria-disabled="true"');
    expect(actions).not.toContain("For the best PDF");
  });
  it("defaults to no diagrams (the empty view)", () => {
    expect(shell()).not.toContain("aria-disabled");
  });
});

describe("print stylesheet (S7-R3, ADR-013)", () => {
  // The shell, scheme and dialog print rules are the installed registry theme's (US-216, ADR-020), not globals.css's.
  const css = readFileSync(fileURLToPath(new URL("../../app/esg-theme.css", import.meta.url)), "utf8");
  const print = css.slice(css.indexOf("@media print"));
  // The page-content print rules moved into the one print block at the end of wr-prose.css (US-196).
  const prose = readFileSync(fileURLToPath(new URL("../../app/wr-prose.css", import.meta.url)), "utf8");
  const proseprint = prose.slice(prose.indexOf("@media print"));
  it("forces the light scheme after the dark sets, which are screen-only, so the Shiki variables (US-190) resolve light", () => {
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf("@media screen and (prefers-color-scheme: dark)"));
    expect(print).toContain("color-scheme: light");
    // The old dual-theme remap is gone: Shiki's colours are `--shiki-*` variables in wr-prose.css, set from the tokens.
    expect(css).not.toMatch(/--shiki-(light|dark)|pre\.shiki/);
    expect(css).toContain("@media not print {\n    :root[data-theme=\"dark\"] {");
    expect(css).toContain("@media screen and (prefers-color-scheme: dark) {\n    :root:not([data-theme]) {");
  });
  it("keeps pre, table, diagrams and callouts whole", () => {
    expect(proseprint).toMatch(/:where\(pre, table, img, details, \[data-mermaid-id\], \.callout, \.note-embed, \.embed-marker\)\s*\{\s*break-inside: avoid/);
  });
  it("never prints a diagram's raw fence source, and adds no text", () => {
    expect(proseprint).toMatch(/\[data-mermaid-id\] > pre\s*\{\s*display: none/);
    expect(print).not.toMatch(/content:\s*["']/);
    expect(proseprint).not.toMatch(/content:\s*["']/);
  });
  it("hides an open search dialog", () => {
    expect(print).toContain('[data-slot="dialog-overlay"]');
    expect(print).toContain('[data-slot="dialog-content"]');
  });
});

describe("no server PDF path (TC-484, SR-014, ADR-013, D6, D7)", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const appFiles = walk(join(root, "app"));

  it("no route segment or route/page file under src/app names a PDF", () => {
    expect(appFiles.filter((f) => /pdf/i.test(f.slice(root.length)))).toEqual([]);
  });
  it("no route handler or page returns application/pdf", () => {
    const routes = appFiles.filter((f) => /\/(route|page)\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((f) => /application\/pdf/i.test(readFileSync(f, "utf8")))).toEqual([]);
  });
  it("no PDF or headless-browser library is a runtime dependency; playwright stays dev-only", () => {
    const pkg = JSON.parse(readFileSync(join(root, "../package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /puppeteer|playwright|pdfkit|jspdf|pdf-lib|html2pdf|wkhtml/i.test(d))).toEqual([]);
  });
  it("next.config has no PDF rewrite or redirect", () => {
    expect(readFileSync(join(root, "../next.config.ts"), "utf8")).not.toMatch(/pdf/i);
  });
});
