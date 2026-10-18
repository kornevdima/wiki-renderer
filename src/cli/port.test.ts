import net from "node:net";

import { describe, expect, it } from "vitest";

import { portProblemMessage, probePort } from "./port";

describe("portProblemMessage", () => {
  it("is exactly one line naming the port and the way out", () => {
    expect(portProblemMessage(3000)).toBe("Port 3000 is in use. Try --port <other>.");
    expect(portProblemMessage(3000)).not.toContain("\n");
  });
  it("says permission for EACCES", () => {
    expect(portProblemMessage(80, "EACCES")).toBe("Port 80 needs permission. Try --port <other>.");
  });
});

describe("probePort without a wildcard bind", () => {
  const bindFree = () => ({
    once(event: string, cb: () => void) {
      if (event === "listening") queueMicrotask(cb);
    },
    listen: () => undefined,
    close: (cb: () => void) => cb(),
  });
  const listener = bindFree as unknown as () => import("./port").Listener;

  it("is busy when a connect to 127.0.0.1 or ::1 succeeds, even though the bind worked", async () => {
    const seen: string[] = [];
    const only = (host: string) => async (_port: number, h: string) => {
      seen.push(h);
      return h === host;
    };
    expect(await probePort(1, { createServer: listener, connect: only("127.0.0.1") })).toEqual({ free: false, code: "EADDRINUSE" });
    expect(await probePort(1, { createServer: listener, connect: only("::1") })).toEqual({ free: false, code: "EADDRINUSE" });
    expect(seen).toEqual(["127.0.0.1", "127.0.0.1", "::1"]);
  });

  it("is free when the bind works and nothing accepts a connection", async () => {
    expect(await probePort(1, { createServer: listener, connect: async () => false })).toEqual({ free: true });
  });

  it("is busy, with the code, when the bind fails, and does not connect", async () => {
    const failing = (() => ({
      once(event: string, cb: (e: { code: string }) => void) {
        if (event === "error") queueMicrotask(() => cb({ code: "EACCES" }));
      },
      listen: () => undefined,
      close: () => undefined,
    })) as unknown as () => import("./port").Listener;
    const connect = async () => {
      throw new Error("should not connect");
    };
    expect(await probePort(80, { createServer: failing, connect })).toEqual({ free: false, code: "EACCES" });
  });
});

describe("probePort", () => {
  it("reports a held port as busy and a free one as free", async () => {
    const holder = net.createServer();
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
    const { port } = holder.address() as net.AddressInfo;
    expect(await probePort(port)).toEqual({ free: false, code: "EADDRINUSE" });
    await new Promise((resolve) => holder.close(resolve));
    expect(await probePort(port)).toEqual({ free: true });
  });
});
