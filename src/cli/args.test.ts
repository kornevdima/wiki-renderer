import { describe, expect, it } from "vitest";

import { DEFAULT_PORT, parseArgs, parsePort } from "./args";

const ok = (argv: string[]) => {
  const r = parseArgs(argv);
  if (!r.ok) throw new Error(r.message);
  return r.command;
};
const message = (argv: string[]) => {
  const r = parseArgs(argv);
  if (r.ok) throw new Error("expected a usage error");
  return r.message;
};

describe("parseArgs", () => {
  it("starts on the default port and opens the browser with no arguments", () => {
    expect(ok([])).toEqual({ kind: "start", port: null, open: true, verbose: false });
    expect(ok(["start"])).toEqual({ kind: "start", port: null, open: true, verbose: false });
  });

  it("takes --port <n>, --port=<n> and --no-open in any order", () => {
    expect(ok(["--port", "3310", "--no-open"])).toEqual({ kind: "start", port: 3310, open: false, verbose: false });
    expect(ok(["--no-open", "--port=4000"])).toEqual({ kind: "start", port: 4000, open: false, verbose: false });
    expect(ok(["start", "--port", "8080"])).toEqual({ kind: "start", port: 8080, open: true, verbose: false });
  });

  it("refuses a bad port", () => {
    for (const bad of ["0", "65536", "abc", "-1", "30.5", ""]) expect(message(["--port", bad])).toMatch(/--port needs a number/);
    expect(message(["--port"])).toMatch(/--port needs a number/);
  });

  it("parses add with an optional id, remove and list", () => {
    expect(ok(["add", "notes"])).toEqual({ kind: "add", folder: "notes" });
    expect(ok(["add", "notes", "--id", "mine"])).toEqual({ kind: "add", folder: "notes", id: "mine" });
    expect(ok(["add", "--id=mine", "~/notes"])).toEqual({ kind: "add", folder: "~/notes", id: "mine" });
    expect(ok(["remove", "mine"])).toEqual({ kind: "remove", id: "mine" });
    expect(ok(["list"])).toEqual({ kind: "list" });
  });

  it("answers --version and --help whatever else is there", () => {
    expect(ok(["--version"])).toEqual({ kind: "version" });
    expect(ok(["-v"])).toEqual({ kind: "version" });
    expect(ok(["add", "--help"])).toEqual({ kind: "help" });
    expect(ok(["bogus", "-h"])).toEqual({ kind: "help" });
  });

  it("reports wrong usage as one line", () => {
    expect(message(["bogus"])).toBe("Unknown command bogus.");
    expect(message(["--wat"])).toBe("Unknown option --wat.");
    expect(message(["add"])).toMatch(/add needs one folder/);
    expect(message(["add", "a", "b"])).toMatch(/add needs one folder/);
    expect(message(["remove"])).toMatch(/remove needs one id/);
    expect(message(["list", "x"])).toMatch(/list takes no arguments/);
    expect(message(["add", "a", "--port", "3000"])).toMatch(/belong to start/);
    expect(message(["--id", "x"])).toMatch(/--id belongs to add/);
    expect(message(["--id"])).toMatch(/--id needs a value/);
  });
});

it("takes --verbose for start only", () => {
  expect(ok(["--verbose"])).toEqual({ kind: "start", port: null, open: true, verbose: true });
  expect(message(["add", "x", "--verbose"])).toMatch(/belong to start/);
});

it("keeps the default at 4700", () => {
  expect(DEFAULT_PORT).toBe(4700);
});

describe("parsePort", () => {
  it("accepts 1 to 65535 only", () => {
    expect(parsePort("1")).toBe(1);
    expect(parsePort("65535")).toBe(65535);
    expect(parsePort("65536")).toBeNull();
    expect(parsePort("0")).toBeNull();
    expect(parsePort("3000x")).toBeNull();
  });
});
