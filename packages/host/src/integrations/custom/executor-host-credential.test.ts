import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { MemoryCustomSecretStore } from "./secrets";
import type { CustomIntegrationDef } from "./types";

/**
 * The zero-tool credential judge (the Croma bug): the executor's tool sync
 * swallows a 401 from an auth-walled MCP server into an EMPTY catalog, so a
 * rejected or unresolvable stored token used to compile as "active, 0
 * actions" — the detail card said "Connected and working" while nothing
 * worked and the agent flailed. `connectedState` now validates the stored
 * credential when an authenticated MCP def lists zero tools: rejected →
 * `pending` (the Sign in / Enter key affordance returns), uncheckable →
 * `error` with the honest reason.
 */

// A minimal auth-walled MCP endpoint: every request without the magic bearer
// is turned away like Croma does (401 + WWW-Authenticate), so the executor's
// sync yields zero tools and the probe reports an auth wall.
const server = createServer((req, res) => {
  if (req.headers.authorization === "Bearer good-token") {
    // Never reached in these tests; present so a future "healthy" case can
    // extend the same server.
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
    return;
  }
  res.statusCode = 401;
  res.setHeader("WWW-Authenticate", 'Bearer realm="mcp"');
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "invalid_token" }));
});

let endpoint = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const defOf = (slug: string): CustomIntegrationDef => ({
  kind: "mcp",
  slug,
  name: "Walled",
  endpoint,
  auth: "oauth",
  addedAtMs: Date.now(),
  credential: { template: "header", secretIds: { token: `ci_${slug}_token` } },
});

test("a stored credential the server rejects lands pending, never active-0", async () => {
  const secrets = new MemoryCustomSecretStore();
  await secrets.set("ci_walled_token", "stale-token");
  const def = defOf("walled");
  const host = new CustomExecutorHost(secrets, async () => [def]);
  const { states } = await host.ensure();
  const state = states.get("walled");
  expect(state?.status).toBe("pending");
});

test("an unreachable secret store lands the honest error, never active-0", async () => {
  const secrets = {
    get: async () => {
      throw new Error("credentials service down");
    },
    set: async () => {},
    delete: async () => {},
  };
  const def = defOf("walled2");
  const host = new CustomExecutorHost(secrets, async () => [def]);
  const { states } = await host.ensure();
  // The exact failing step varies (the connection attach may surface the
  // store failure before the zero-tool judge runs) — the invariant is that a
  // broken credential path is an ERROR state, never "active, 0 actions".
  const state = states.get("walled2");
  expect(state?.status).toBe("error");
});
