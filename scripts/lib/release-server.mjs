// A local stand-in for GitHub's release downloads and `releases/latest` API (US-279), for the installer tests and the
// release workflow's installer step. It listens on 127.0.0.1 only, on the first free port of 3320-3329, and serves:
//   GET <origin>/api/releases/latest                  {"tag_name":"v<latest>"}      (404 when `state.latest` is null)
//   GET <origin>/dl/download/v<version>/<asset>       the bytes in `state.releases[version][asset]`
// Point the installers at it with WIKI_RENDERER_API_BASE=<apiBase> and WIKI_RENDERER_DOWNLOAD_BASE=<downloadBase>.
import http from "node:http";

export const FIRST_PORT = 3320;
export const LAST_PORT = 3329;

function listenOnFirstFree(server) {
  return new Promise((resolve, reject) => {
    let port = FIRST_PORT;
    const attempt = () => {
      const onError = (error) => {
        if (error.code === "EADDRINUSE" && port < LAST_PORT) {
          port += 1;
          attempt();
        } else {
          reject(error);
        }
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", onError);
        resolve(port);
      });
    };
    attempt();
  });
}

/**
 * `state` is `{ latest: string | null, releases: { [version]: { [assetName]: Buffer | string } } }` and may be changed
 * while the server runs. Returns `{ origin, apiBase, downloadBase, requests, close }`; `requests` lists every URL path asked for.
 */
export async function serveReleases(state) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push(url.pathname);
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === "/api/releases/latest") {
      if (state.latest === null || state.latest === undefined) {
        res.writeHead(404, { "content-type": "application/json" }).end('{"message":"Not Found"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tag_name: `v${state.latest}`, name: `v${state.latest}` }, null, 2));
      return;
    }
    const match = /^\/dl\/download\/v([^/]+)\/([^/]+)$/.exec(url.pathname);
    const body = match ? state.releases[match[1]]?.[match[2]] : undefined;
    if (body === undefined) {
      res.writeHead(404).end("Not Found");
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": Buffer.byteLength(body) }).end(body);
  });
  const port = await listenOnFirstFree(server);
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    apiBase: `${origin}/api`,
    downloadBase: `${origin}/dl`,
    requests,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
