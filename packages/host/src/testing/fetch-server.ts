import { createServer, type Server } from "node:http";

export interface TestFetchServer {
  readonly port: number;
  readonly baseUrl: string;
  stop(): Promise<void>;
}

function requestBodyAllowed(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function readRequestBody(req: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}

function responseHeaders(
  response: Response,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] =
      key === "set-cookie" ? response.headers.getSetCookie() : value;
  });
  return headers;
}

export async function startTestFetchServer(
  fetch: (req: Request) => Response | Promise<Response>,
): Promise<TestFetchServer> {
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const url = `http://${host}${req.url ?? "/"}`;
      const body = requestBodyAllowed(req.method)
        ? await readRequestBody(req)
        : undefined;
      const response = await fetch(
        new Request(url, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: body ? new Uint8Array(body) : undefined,
        }),
      );
      res.writeHead(response.status, responseHeaders(response));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("test fetch server did not bind to a TCP port");
  }

  return {
    port: address.port,
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
