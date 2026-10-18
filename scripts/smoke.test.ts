import { describe, expect, it } from "vitest";

import { externalIPv4 } from "./smoke.mjs";

describe("externalIPv4", () => {
  it("keeps non-loopback IPv4 addresses only", () => {
    expect(
      externalIPv4({
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
        en0: [
          { address: "192.168.1.5", family: "IPv4", internal: false },
          { address: "fe80::1", family: "IPv6", internal: false },
        ],
        empty: undefined,
      }),
    ).toEqual(["192.168.1.5"]);
  });
});
