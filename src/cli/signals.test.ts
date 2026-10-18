// US-278 R3 amendment: SIGINT, SIGTERM and SIGHUP all stop the child (start.test.ts proves what stopping does: SIGTERM, then
// SIGKILL after 5 s). `main.ts` runs the process, so what can be pinned without starting a server is which signals it hooks.
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

it("main.ts hooks SIGINT, SIGTERM and SIGHUP to the stop function", () => {
  const source = readFileSync(path.resolve("src/cli/main.ts"), "utf8");
  const hooked = /for \(const signal of \[([^\]]+)\] as const\) process\.on\(signal, stop\)/.exec(source);
  expect(hooked, "no `for (const signal of [...]) process.on(signal, stop)` in main.ts").not.toBeNull();
  expect([...hooked![1]!.matchAll(/"(\w+)"/g)].map((m) => m[1]).sort()).toEqual(["SIGHUP", "SIGINT", "SIGTERM"]);
});
