import net from "node:net";

/** The one line printed when a fixed port cannot be used. */
export function portProblemMessage(port: number, code?: string): string {
  if (code === "EACCES") return `Port ${port} needs permission. Try --port <other>.`;
  return `Port ${port} is in use. Try --port <other>.`;
}

export type Listener = {
  once(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
  once(event: "listening", listener: () => void): unknown;
  listen(port: number, host: string): unknown;
  close(callback: () => void): unknown;
};

export type Probe = { free: true } | { free: false; code?: string };

/** True when something accepts a TCP connection on `host:port` within a second. A refusal, an unreachable address (no IPv6) or a timeout is false. */
export function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function tryBind(port: number, createServer: () => Listener): Promise<Probe> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error) => resolve({ free: false, ...(error.code === undefined ? {} : { code: error.code }) }));
    server.once("listening", () => server.close(() => resolve({ free: true })));
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Is `port` taken? Busy when binding 127.0.0.1 fails, or when a TCP connect to 127.0.0.1 or ::1 succeeds. The connect
 * covers a listener on `0.0.0.0` or `::`, which macOS lets 127.0.0.1 bind beside. Nothing is bound on a wildcard address:
 * that can raise the macOS or Windows firewall prompt ("OS won't argue"). The same on every platform.
 */
export async function probePort(
  port: number,
  deps: { createServer?: () => Listener; connect?: (port: number, host: string) => Promise<boolean> } = {},
): Promise<Probe> {
  const bound = await tryBind(port, deps.createServer ?? (() => net.createServer()));
  if (!bound.free) return bound;
  const connect = deps.connect ?? canConnect;
  for (const host of ["127.0.0.1", "::1"]) {
    if (await connect(port, host)) return { free: false, code: "EADDRINUSE" };
  }
  return { free: true };
}
