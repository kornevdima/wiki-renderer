import { describe, expect, it } from "vitest";

import { candidatePorts, resolvePortPlan } from "./port-plan";

const plan = (input: Parameters<typeof resolvePortPlan>[0]) => {
  const r = resolvePortPlan(input);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
};

describe("resolvePortPlan", () => {
  it("is the default with a fallback range when nothing is chosen", () => {
    expect(plan({ flag: null, env: {} })).toEqual({ kind: "range", first: 4700, last: 4709 });
    expect(plan({ flag: null, env: { WIKI_RENDERER_PORT: "  " } })).toEqual({ kind: "range", first: 4700, last: 4709 });
  });

  it("takes --port first, then WIKI_RENDERER_PORT, then the config port, each fixed", () => {
    const env = { WIKI_RENDERER_PORT: "4800" };
    expect(plan({ flag: 4900, env, configPort: 4750 })).toEqual({ kind: "fixed", port: 4900, source: "--port" });
    expect(plan({ flag: null, env, configPort: 4750 })).toEqual({ kind: "fixed", port: 4800, source: "WIKI_RENDERER_PORT" });
    expect(plan({ flag: null, env: {}, configPort: 4750 })).toEqual({ kind: "fixed", port: 4750, source: "config" });
  });

  it("refuses a bad WIKI_RENDERER_PORT", () => {
    for (const bad of ["abc", "0", "70000", "47.5"]) {
      expect(resolvePortPlan({ flag: null, env: { WIKI_RENDERER_PORT: bad } })).toEqual({ ok: false, message: "WIKI_RENDERER_PORT needs a number from 1 to 65535." });
    }
  });
});

describe("candidatePorts", () => {
  it("lists 4700 to 4709 for the default and one port for a fixed choice", () => {
    expect(candidatePorts({ kind: "range", first: 4700, last: 4709 })).toEqual([4700, 4701, 4702, 4703, 4704, 4705, 4706, 4707, 4708, 4709]);
    expect(candidatePorts({ kind: "fixed", port: 3000, source: "--port" })).toEqual([3000]);
  });
});
