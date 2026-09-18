import { createServer, type Server } from "node:http";
import { afterEach, expect, test, vi } from "vitest";

/**
 * The /run gate end to end, over a real socket, for each of the three
 * configurations a deploy can be in. Every case re-imports ./server with the
 * env it is about (config reads the environment once, at import), so no case
 * can be influenced by another file's process env.
 */

const OWNED = ["SANDBOX_TOKEN", "SANDBOX_ALLOW_UNAUTHENTICATED"] as const;
const prior = new Map(OWNED.map((key) => [key, process.env[key]]));
const servers: Server[] = [];

afterEach(() => {
  for (const key of OWNED) {
    const value = prior.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const server of servers.splice(0)) server.close();
});

async function listen(env: Record<string, string | undefined>) {
  for (const key of OWNED) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  vi.resetModules();
  const { handle } = await import("./server");
  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("no address");
  return `http://127.0.0.1:${addr.port}`;
}

/** A body the executor would reject, so a 2xx can never mean "it ran". */
const post = (base: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ language: "cobol", code: "x" }),
  });

test("no SANDBOX_TOKEN refuses /run: an unset secret is not an open service", async () => {
  const base = await listen({});
  const res = await post(base);
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("SANDBOX_ALLOW_UNAUTHENTICATED=1 is the explicit local-dev opt-out", async () => {
  const base = await listen({ SANDBOX_ALLOW_UNAUTHENTICATED: "1" });
  // Past the gate: the request reaches the executor, which refuses the language.
  const res = await post(base);
  expect(res.status).toBe(400);
});

test("a configured token admits the right value and refuses the rest", async () => {
  const base = await listen({ SANDBOX_TOKEN: "s3cret" });
  expect((await post(base, { "x-sandbox-token": "s3cret" })).status).toBe(400);
  expect((await post(base, { "x-sandbox-token": "wrong" })).status).toBe(401);
  expect((await post(base)).status).toBe(401);
});

test("/health stays unauthenticated (the liveness probe holds no secret)", async () => {
  const base = await listen({});
  const res = await fetch(`${base}/health`);
  expect(res.status).toBe(200);
});
