/**
 * US-205 (NFR-013, NFR-009): the segment and global error boundaries render the one ESG error page. Static markup, so the
 * claims here are the frame, the copy, the two actions and that nothing of the error reaches the HTML. `reset()` wiring and
 * the real boundary are e2e.
 */
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), useEffect: () => undefined }));
vi.mock("@/fonts", () => ({ fontVariableClasses: "font-figtree-var font-lilex-var" }));

import messages from "../../messages/en.json";

import ErrorBoundary from "./error";
import GlobalError from "./global-error";

const SECRET = "SECRET-LEAK-CANARY-7f3a";

function failure(): Error & { digest?: string } {
  const error = new Error(`boom ${SECRET}`) as Error & { digest?: string };
  error.digest = "DIGEST-1234567890";
  return error;
}

const withIntl = (child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", timeZone: "UTC", messages, children: child }));

const segment = withIntl(createElement(ErrorBoundary, { error: failure(), reset: () => undefined }));
const global = renderToStaticMarkup(createElement(GlobalError, { error: failure(), reset: () => undefined }));

describe.each([
  ["error.tsx", segment],
  ["global-error.tsx", global],
])("US-205 — %s", (_name, html) => {
  it("is on the bare frame: slim brand bar and exactly one main", () => {
    expect(html).toContain('data-slot="bare-frame"');
    expect(html).toContain('data-slot="bare-frame-bar"');
    expect(html).toContain('data-testid="brand"');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('data-testid="error-page"');
  });

  it("has the aria-hidden warning icon, the h1 and the accepted body, verbatim", () => {
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toMatch(/<h1 data-slot="empty-state-title"[^>]*>Something went wrong<\/h1>/);
    expect(html).toContain("This page couldn&#x27;t be shown. Try again, or go back to your wikis.");
    expect(html).toMatch(/data-slot="empty-state-icon" aria-hidden="true"/);
  });

  it("has a solid Try again button and an outline Back to your wikis link to /", () => {
    expect(html).toMatch(/<button[^>]*data-variant="solid"[^>]*data-testid="error-page-retry"[^>]*>.*Try again<\/button>/);
    const back = /<a [^>]*data-testid="error-page-back"[^>]*>Back to your wikis<\/a>/.exec(html)?.[0] ?? "";
    expect(back).toContain('href="/"');
    expect(back).toContain('data-variant="outline"');
  });

  it("renders no error message, stack or digest", () => {
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("boom");
    expect(html).not.toContain("DIGEST");
    expect(html).not.toContain("Error:");
  });
});

describe("US-205 — global-error.tsx owns the document", () => {
  it("renders its own html (lang, font variables) and body around the page", () => {
    expect(global.startsWith('<html lang="en" class="font-figtree-var font-lilex-var">')).toBe(true);
    expect(global).toContain("<body>");
    expect(global.indexOf("<body>")).toBeLessThan(global.indexOf('data-slot="bare-frame"'));
  });

  it("sets no data-theme at render (the stored choice is applied after hydration)", () => {
    expect(global).not.toContain("data-theme");
  });
});

describe("US-205 — error.tsx sits inside the root layout", () => {
  it("renders no html or body of its own", () => {
    expect(segment).not.toContain("<html");
    expect(segment).not.toContain("<body");
  });
});

describe("US-205 — retry wiring (behaviour)", () => {
  type WithRetry = { props: { onRetry: () => void; children?: unknown } };
  const retryOf = (element: unknown) => (element as WithRetry).props.onRetry;

  it("error.tsx: Try again runs router.refresh() and reset()", () => {
    refresh.mockClear();
    const reset = vi.fn();
    retryOf(ErrorBoundary({ error: failure(), reset }))();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("global-error.tsx: Try again reloads the window", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    try {
      const html = GlobalError() as unknown as WithRetry;
      const body = html.props.children as WithRetry;
      const provider = body.props.children as WithRetry;
      retryOf(provider.props.children)();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
