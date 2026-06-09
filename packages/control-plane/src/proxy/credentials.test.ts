import { test, expect, afterEach } from "bun:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createKeylessProxy } from "./credentials";
import { EnvCredentialVault } from "../credentials/vault";

const SECRET = "proxy-test-secret";

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: Server): Promise<void> {
  // Drop lingering keep-alive / streaming sockets so close() resolves promptly,
  // then resolve regardless after a short grace period (teardown must not hang).
  server.closeAllConnections?.();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    server.close(() => finish());
    server.closeAllConnections?.();
    setTimeout(finish, 200).unref?.();
  });
}

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop();
    if (s) await close(s);
  }
});

/** Capturing upstream: records what headers/body it received, replies as told. */
function upstreamServer(
  onRequest: (info: { headers: IncomingMessage["headers"]; body: string }) => void,
  reply: (res: ServerResponse) => void,
): Server {
  const s = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    onRequest({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
    reply(res);
  });
  servers.push(s);
  return s;
}

test("injects the real key upstream; sandbox token never reaches upstream", async () => {
  let seen: { headers: IncomingMessage["headers"]; body: string } | null = null;
  const upstream = upstreamServer(
    (info) => (seen = info),
    (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-REAL-secret" },
  });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const sandboxToken = vault.sandboxToken("ws-1", "agent-7");
  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": sandboxToken, "content-type": "application/json" },
    body: JSON.stringify({ model: "claude" }),
  });

  expect(resp.status).toBe(200);
  expect(await resp.json()).toEqual({ ok: true });

  const captured = seen as { headers: IncomingMessage["headers"]; body: string } | null;
  expect(captured).not.toBeNull();
  // The injection: upstream sees the REAL key.
  expect(captured!.headers["x-api-key"]).toBe("sk-REAL-secret");
  // And NEVER the sandbox token.
  expect(captured!.headers["x-api-key"]).not.toBe(sandboxToken);
  // Body is forwarded intact.
  expect(JSON.parse(captured!.body)).toEqual({ model: "claude" });
});

test("the real key never appears in the response delivered to the sandbox", async () => {
  const upstream = upstreamServer(
    () => {},
    (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ echo: "no secrets here" }));
    },
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-REAL-secret" },
  });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": vault.sandboxToken("ws-1", "agent-7") },
    body: "{}",
  });
  const text = await resp.text();
  expect(text).not.toContain("sk-REAL-secret");
});

test("a forged sandbox token is rejected with 401 and never hits upstream", async () => {
  let upstreamHit = false;
  const upstream = upstreamServer(
    () => (upstreamHit = true),
    (res) => res.end("should not happen"),
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-REAL-secret" },
  });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  // Token signed with the WRONG secret → forged.
  const forged = new EnvCredentialVault({ secret: "wrong" }).sandboxToken("ws-1", "agent-7");
  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": forged },
    body: "{}",
  });

  expect(resp.status).toBe(401);
  expect(await resp.json()).toMatchObject({ error: "unauthorized sandbox token" });
  expect(upstreamHit).toBe(false);
});

test("a missing token is rejected with 401", async () => {
  const upstream = upstreamServer(
    () => {},
    (res) => res.end("nope"),
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({ secret: SECRET });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, { method: "POST", body: "{}" });
  expect(resp.status).toBe(401);
});

test("a valid token for a workspace with no provider key returns 502 (no leak)", async () => {
  const upstream = upstreamServer(
    () => {},
    (res) => res.end("nope"),
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({ secret: SECRET }); // no keys
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": vault.sandboxToken("ws-1", "agent-7") },
    body: "{}",
  });
  expect(resp.status).toBe(502);
  expect(await resp.json()).toMatchObject({ error: "no provider key for workspace" });
});

test("upstream SSE stream is passed through unbuffered (chunks arrive incrementally)", async () => {
  // Upstream emits two SSE chunks with a gap; the proxy must stream, not buffer.
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: first\n\n");
    setTimeout(() => {
      res.write("data: second\n\n");
      res.end();
    }, 40);
  });
  servers.push(upstream);
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-REAL-secret" },
  });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const resp = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": vault.sandboxToken("ws-1", "agent-7") },
    body: "{}",
  });
  expect(resp.headers.get("content-type")).toContain("text/event-stream");

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  const firstStart = Date.now();
  const first = await reader.read();
  const firstChunk = decoder.decode(first.value);
  const firstAt = Date.now() - firstStart;

  // Drain the rest.
  let rest = "";
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    rest += decoder.decode(r.value);
  }

  expect(firstChunk).toContain("data: first");
  expect(rest).toContain("data: second");
  // First chunk arrived well before the 40ms upstream gap → not buffered to the end.
  expect(firstAt).toBeLessThan(35);
});

test("a 401 token never causes an unhandled rejection (proxy stays up for next request)", async () => {
  const upstream = upstreamServer(
    () => {},
    (res) => {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    },
  );
  const upstreamPort = await listen(upstream);

  const vault = new EnvCredentialVault({
    secret: SECRET,
    keys: { CP_WORKSPACE_KEY_WS_1_ANTHROPIC: "sk-REAL-secret" },
  });
  const proxy = createKeylessProxy({
    upstream: `http://127.0.0.1:${upstreamPort}`,
    provider: "anthropic",
    vault,
  });
  servers.push(proxy);
  const proxyPort = await listen(proxy);

  const bad = await fetch(`http://127.0.0.1:${proxyPort}/`, { method: "POST", body: "{}" });
  expect(bad.status).toBe(401);

  // Server still serves the next, valid request.
  const good = await fetch(`http://127.0.0.1:${proxyPort}/`, {
    method: "POST",
    headers: { "x-api-key": vault.sandboxToken("ws-1", "agent-7") },
    body: "{}",
  });
  expect(good.status).toBe(200);
});
