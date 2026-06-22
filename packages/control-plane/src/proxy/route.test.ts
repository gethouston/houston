import { test, expect } from "bun:test";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { AddressInfo } from "node:net";
import { forward } from "./route";
import type { RuntimeEndpoint } from "../ports";

/** Spin up a node:http server on an ephemeral port and resolve its base URL. */
function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{
  server: Server;
  baseUrl: string;
}> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// The exact bytes a Houston runtime's SSE stream produces: a comment heartbeat,
// a `sync` frame, and a `text` frame. The proxy must deliver these verbatim.
const SSE_PAYLOAD =
  ": heartbeat\n\n" +
  'event: sync\ndata: {"turn":"idle"}\n\n' +
  'event: text\ndata: {"delta":"hello"}\n\n';

test("forward relays method + sub-path + query + body under the sandbox Bearer, and the runtime's JSON status", async () => {
  let seen: Record<string, string | undefined> = {};
  const { server: upstream, baseUrl } = await listen(async (req, res) => {
    seen = {
      method: req.method,
      path: req.url,
      auth: req.headers.authorization,
      contentType: req.headers["content-type"],
      body: await readBody(req),
    };
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const endpoint: RuntimeEndpoint = { baseUrl, token: "sbx-abc" };
  let done: Promise<void> | undefined;
  const { server: proxy, baseUrl: proxyUrl } = await listen((_req, res) => {
    done = forward(
      endpoint,
      {
        method: "POST",
        path: "/conversations/c1/messages",
        search: "?foo=bar",
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ text: "hi", nonce: "n1" })),
      },
      res,
    );
  });

  const r = await fetch(`${proxyUrl}/whatever`);
  const j = (await r.json()) as { ok: boolean };
  await done;
  await close(proxy);
  await close(upstream);

  expect(seen.method).toBe("POST");
  expect(seen.path).toBe("/conversations/c1/messages?foo=bar");
  expect(seen.auth).toBe("Bearer sbx-abc"); // the agent's token, never the caller's
  expect(seen.contentType).toBe("application/json");
  expect(JSON.parse(seen.body!)).toEqual({ text: "hi", nonce: "n1" });
  expect(r.status).toBe(202);
  expect(j).toEqual({ ok: true });
});

test("forward relays a runtime error response AS ITSELF (e.g. 400), never masking it as 502", async () => {
  const { server: upstream, baseUrl } = await listen((_req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "login already in progress" }));
  });

  const endpoint: RuntimeEndpoint = { baseUrl, token: "t" };
  let done: Promise<void> | undefined;
  const { server: proxy, baseUrl: proxyUrl } = await listen((_req, res) => {
    done = forward(
      endpoint,
      {
        method: "POST",
        path: "/auth/openai-codex/login",
        search: "",
        contentType: "application/json",
        body: Buffer.from("{}"),
      },
      res,
    );
  });

  const r = await fetch(`${proxyUrl}/`);
  const j = (await r.json()) as { error: string };
  await done;
  await close(proxy);
  await close(upstream);

  expect(r.status).toBe(400);
  expect(j.error).toContain("login already in progress");
});

test("forward pipes a text/event-stream response 1:1, including the heartbeat comment", async () => {
  let seenAccept: string | undefined;
  let seenAuth: string | undefined;
  const { server: upstream, baseUrl } = await listen((req, res) => {
    seenAccept = req.headers.accept;
    seenAuth = req.headers.authorization;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write(SSE_PAYLOAD);
    res.end();
  });

  const endpoint: RuntimeEndpoint = { baseUrl, token: "sbx-stream" };
  let done: Promise<void> | undefined;
  const { server: proxy, baseUrl: proxyUrl } = await listen((_req, res) => {
    done = forward(
      endpoint,
      { method: "GET", path: "/conversations/c1/events", search: "" },
      res,
    );
  });

  const r = await fetch(`${proxyUrl}/`);
  const text = await r.text();
  await done;
  await close(proxy);
  await close(upstream);

  expect(r.headers.get("content-type")).toBe("text/event-stream");
  expect(text).toBe(SSE_PAYLOAD);
  expect(text).toContain(": heartbeat\n\n");
  expect(seenAccept).toBe("text/event-stream");
  expect(seenAuth).toBe("Bearer sbx-stream");
});

test("forward aborts the upstream stream when the client disconnects (clean resolve, no idle hang)", async () => {
  let upstreamClosed = false;
  const { server: upstream, baseUrl } = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": hb\n\n");
    req.on("close", () => {
      upstreamClosed = true;
    });
    // intentionally no res.end() — a long-lived stream
  });

  const endpoint: RuntimeEndpoint = { baseUrl, token: "t" };
  let resolved = false;
  const { server: proxy, baseUrl: proxyUrl } = await listen((_req, res) => {
    forward(
      endpoint,
      { method: "GET", path: "/conversations/c/events", search: "" },
      res,
    ).then(() => {
      resolved = true;
    });
  });

  const ac = new AbortController();
  const res = await fetch(`${proxyUrl}/`, { signal: ac.signal });
  const reader = res.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain(": hb");
  ac.abort();
  await reader.cancel().catch(() => {});

  await new Promise((r) => setTimeout(r, 100));
  await close(proxy);
  await close(upstream);

  expect(resolved).toBe(true);
  expect(upstreamClosed).toBe(true);
});

test("forward surfaces an unreachable runtime as a 502 (no swallow)", async () => {
  // Bind then immediately close so the port is guaranteed closed → ECONNREFUSED.
  const { server: dead, baseUrl: deadUrl } = await listen(() => {});
  await close(dead);

  const endpoint: RuntimeEndpoint = { baseUrl: deadUrl, token: "t" };
  let err: unknown;
  const { server: proxy, baseUrl: proxyUrl } = await listen((_req, res) => {
    forward(
      endpoint,
      { method: "GET", path: "/auth/status", search: "" },
      res,
    ).catch((e) => {
      err = e;
    });
  });

  const r = await fetch(`${proxyUrl}/`);
  const body = await r.text();
  await close(proxy);

  expect(r.status).toBe(502);
  expect(body).toContain("sandbox proxy failed");
  expect(err).toBeTruthy();
});
