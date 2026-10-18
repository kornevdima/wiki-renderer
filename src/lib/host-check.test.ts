import { describe, expect, it } from "vitest";

import { isLocalHost, listeningPort } from "./host-check";

describe("isLocalHost", () => {
  it("accepts 127.0.0.1 and localhost on the listening port", () => {
    expect(isLocalHost("127.0.0.1:3000", 3000)).toBe(true);
    expect(isLocalHost("localhost:3300", 3300)).toBe(true);
    expect(isLocalHost("LocalHost:3300", 3300)).toBe(true);
  });

  it.each(["evil.example", "evil.example:3300", "127.0.0.1:9999", "127.0.0.1", "localhost", "127.0.0.1.evil.example:3300", "evil.example:3300@127.0.0.1:3300", "0.0.0.0:3300", "[::1]:3300", ""])(
    "refuses %j",
    (host) => {
      expect(isLocalHost(host, 3300)).toBe(false);
    },
  );

  it("refuses a missing Host", () => {
    expect(isLocalHost(null, 3000)).toBe(false);
    expect(isLocalHost(undefined, 3000)).toBe(false);
  });
});

describe("listeningPort", () => {
  it("reads PORT, defaulting to 3000", () => {
    expect(listeningPort({ PORT: "3300" })).toBe(3300);
    expect(listeningPort({})).toBe(3000);
    expect(listeningPort({ PORT: "abc" })).toBe(3000);
    expect(listeningPort({ PORT: "70000" })).toBe(3000);
  });
});
