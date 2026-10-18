// US-278 R3: a port held on another address than 127.0.0.1 (all interfaces, or IPv6) is busy too. A shell script, another
// dev server or a container often listens on `*`, and the launcher must say so rather than start a second listener. The probe
// finds it by connecting to loopback; it binds no wildcard itself (the holders below do, in the test only).
import net from "node:net";

import { describe, expect, it } from "vitest";

import { probePort } from "./port";

function hold(host: string): Promise<net.Server & { port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer() as net.Server & { port: number };
    server.once("error", reject);
    server.listen(0, host, () => {
      server.port = (server.address() as net.AddressInfo).port;
      resolve(server);
    });
  });
}
const close = (server: net.Server) => new Promise((resolve) => server.close(resolve));
/** A machine without IPv6 cannot listen on `::`; that is not a failure of the probe. */
const NO_IPV6 = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL"]);

describe("probePort on a port held on another address", () => {
  for (const host of ["0.0.0.0", "::"]) {
    it(`reports a port held on ${host} as busy`, async (ctx) => {
      let holder: Awaited<ReturnType<typeof hold>>;
      try {
        holder = await hold(host);
      } catch (error) {
        if (host === "::" && NO_IPV6.has((error as NodeJS.ErrnoException).code ?? "")) return ctx.skip();
        throw error;
      }
      try {
        expect(await probePort(holder.port)).toEqual({ free: false, code: "EADDRINUSE" });
      } finally {
        await close(holder);
      }
    });
  }
});
