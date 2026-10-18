import { describe, expect, it } from "vitest";

import { parsePortField } from "./port-field";

describe("parsePortField", () => {
  it("maps empty to null (the default) and a whole number in range to the number", () => {
    expect(parsePortField("")).toBeNull();
    expect(parsePortField("   ")).toBeNull();
    expect(parsePortField("4700")).toBe(4700);
    expect(parsePortField(" 1024 ")).toBe(1024);
    expect(parsePortField("65535")).toBe(65535);
  });
  it("refuses everything else", () => {
    for (const bad of ["1023", "65536", "0", "-5", "47.5", "abc", "47 00", "1e3", "123456"]) expect(parsePortField(bad), bad).toBeUndefined();
  });
});
