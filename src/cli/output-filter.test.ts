import { describe, expect, it } from "vitest";

import { createLineFilter, shouldShowLine } from "./output-filter";

describe("shouldShowLine", () => {
  it("hides Next's banner", () => {
    for (const line of [
      "▲ Next.js 16.3.5",
      "- Local:         http://127.0.0.1:4701",
      "- Network:       http://127.0.0.1:4701",
      "✓ Ready in 0ms",
      "✓ Running next.config took 0.6ms",
      "- Environments: .env",
      "  · serverActions",
    ]) {
      expect(shouldShowLine(line), line).toBe(false);
    }
  });

  it("hides INFO and DEBUG log lines and shows WARN and ERROR ones", () => {
    expect(shouldShowLine('{"severity":"INFO","message":"startup.no_wikis"}')).toBe(false);
    expect(shouldShowLine('{"severity":"DEBUG","message":"x"}')).toBe(false);
    expect(shouldShowLine('{"severity":"WARNING","message":"x"}')).toBe(true);
    expect(shouldShowLine('{"severity":"ERROR","message":"boom"}')).toBe(true);
  });

  it("shows everything else: warnings from Next, stack traces, plain text, a broken JSON line, blank lines", () => {
    for (const line of ['⚠ "next start" does not work with "output: standalone"', "Error: listen EADDRINUSE", "    at Server.setupListenHandle", "{not json", "", "hello"]) {
      expect(shouldShowLine(line), line).toBe(true);
    }
  });
});

describe("createLineFilter", () => {
  it("writes the lines worth showing, joins a line split across chunks, and flushes the last unfinished one", () => {
    const out: string[] = [];
    const filter = createLineFilter((l) => out.push(l));
    filter.push("▲ Next.js 16\n- Local: http://x\n{\"severity\":\"INFO\",");
    filter.push('"message":"a"}\r\n{"severity":"ERROR","message":"b"}\nlast');
    expect(out).toEqual(['{"severity":"ERROR","message":"b"}']);
    filter.flush();
    expect(out).toEqual(['{"severity":"ERROR","message":"b"}', "last"]);
  });
});
