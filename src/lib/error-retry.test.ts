import { describe, expect, it } from "vitest";

import { retrySegment } from "./error-retry";

describe("US-205 — retrySegment", () => {
  it("refreshes the router and resets the boundary, both inside the transition and nowhere else", () => {
    const calls: string[] = [];
    retrySegment({
      refresh: () => calls.push("refresh"),
      reset: () => calls.push("reset"),
      startTransition: (fn) => {
        calls.push("start");
        fn();
        calls.push("end");
      },
    });
    expect(calls).toEqual(["start", "refresh", "reset", "end"]);
  });
});
