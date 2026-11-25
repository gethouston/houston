import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { CredentialVault } from "@houston/host/src/ports";

export type TurnHostHandler = (
  vault: CredentialVault,
  method: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

export interface TurnHostServer {
  origin: string;
  token: string;
  close(): Promise<void>;
}

export interface TurnHostServerOptions {
  claim: { workspaceId: string; agentId: string };
  handle: TurnHostHandler;
  label: string;
  unavailable: { error: string; code: string };
  run?: (serve: () => Promise<void>) => Promise<void>;
}

export async function listenTurnHost(
  opts: TurnHostServerOptions,
): Promise<TurnHostServer> {
  const token = randomBytes(32).toString("hex");
  const expected = Buffer.from(token);
  const vault: CredentialVault = {
    sandboxToken: () => token,
    validateSandboxToken: (presented) => {
      const got = Buffer.from(presented);
      return got.length === expected.length && timingSafeEqual(got, expected)
        ? opts.claim
        : null;
    },
  };
  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();
    if (!(await opts.handle(vault, method, url, req, res))) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown sandbox route" }));
    }
  };
  const run = opts.run ?? ((fn) => fn());
  const server = createServer((req, res) => {
    run(() => serve(req, res)).catch((error: unknown) => {
      const detail =
        error instanceof Error ? `${error.name}: ${error.message}` : "error";
      console.error(`[${opts.label}] request failed (${detail})`);
      if (!res.headersSent)
        res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(opts.unavailable));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export async function callTurnHost(
  server: TurnHostServer,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${server.token}`);
  return fetch(`${server.origin}${path}`, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body !== undefined ? { body: init.body } : {}),
    ...(init?.signal ? { signal: init.signal } : {}),
  });
}
