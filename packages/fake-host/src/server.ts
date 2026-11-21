import { createServer } from "node:http";
import { Readable } from "node:stream";
import { FAKE_HOST_PORT } from "./config";
import { handle } from "./router";

function requestBodyAllowed(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function readBody(req: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}

export interface FakeHost {
  readonly port: number;
  readonly url: string;
  stop(): Promise<void>;
}

export function startFakeHost(port = FAKE_HOST_PORT): Promise<FakeHost> {
  const server = createServer(async (req, res) => {
    const abort = new AbortController();
    req.on("close", () => abort.abort());
    try {
      const host = req.headers.host ?? `127.0.0.1:${port}`;
      const body = requestBodyAllowed(req.method)
        ? await readBody(req)
        : undefined;
      const response = await handle(
        new Request(`http://${host}${req.url ?? "/"}`, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: body ? new Uint8Array(body) : undefined,
          signal: abort.signal,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        Readable.fromWeb(
          response.body as Parameters<typeof Readable.fromWeb>[0],
        ).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(message);
    }
  });
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;

  return new Promise<FakeHost>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      const address = server.address();
      const boundPort =
        typeof address === "object" && address ? address.port : port;
      console.log(`[fake-host] listening on http://localhost:${boundPort}`);
      resolve({
        port: boundPort,
        url: `http://localhost:${boundPort}`,
        stop: () =>
          new Promise<void>((done, fail) => {
            server.closeAllConnections();
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
