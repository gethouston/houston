import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { CustomIntegrationManager } from "./manager";
import { MemoryCustomSecretStore } from "./secrets";
import { MemoryCustomIntegrationStore } from "./store";

/**
 * HOU-1052 follow-up: the compiled view of a URL-sourced OpenAPI spec is
 * in-memory and process-long, so a desktop install could serve a weeks-old
 * tool set. `refreshSpecs` is the verify-then-recompile cycle: re-fetch the
 * spec, compare content hashes, recompile ONLY what actually changed, and
 * never downgrade a working integration on a spec-host outage.
 */

let baseUrl = "";
let specVersion = 1;
let specBroken = false;
let specRequests = 0;

const specDoc = (ops: number) =>
  JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Drifty", version: `${ops}.0.0` },
    servers: [{ url: baseUrl }],
    paths: Object.fromEntries(
      Array.from({ length: ops }, (_, i) => [
        `/things${i === 0 ? "" : i + 1}`,
        {
          get: {
            operationId: i === 0 ? "listThings" : `listThings${i + 1}`,
            responses: { "200": { description: "ok" } },
          },
        },
      ]),
    ),
  });

const server = createServer((req, res) => {
  if (req.url === "/openapi.json") {
    specRequests += 1;
    if (specBroken) {
      res.statusCode = 500;
      res.end("boom");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(specDoc(specVersion));
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true }));
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function setup(ttlMs: number) {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  const host = new CustomExecutorHost(secrets, () => store.list(), ttlMs);
  const manager = new CustomIntegrationManager(store, secrets, host, () => {});
  return { host, manager };
}

test("refreshSpecs verifies by content hash and recompiles only real drift", async () => {
  specVersion = 1;
  specBroken = false;
  specRequests = 0;
  // A huge TTL so ensure() never self-triggers — every verify below is ours.
  const { host, manager } = setup(Number.MAX_SAFE_INTEGER);

  const added = await manager.add({
    kind: "openapi",
    name: "Drifty",
    spec: { kind: "url", url: `${baseUrl}/openapi.json` },
    auth: "none",
  });
  expect(added.state).toEqual({ status: "active", toolCount: 1 });
  expect(specRequests).toBe(1); // the compile fetch

  // First verify records the baseline — no blind recompile.
  await host.refreshSpecs();
  expect(specRequests).toBe(2); // exactly the verify fetch, no compile fetch
  const { states } = await host.ensure();
  expect(states.get(added.slug)).toEqual({ status: "active", toolCount: 1 });

  // Unchanged content: verify again, still no recompile.
  await host.refreshSpecs();
  expect(specRequests).toBe(3);
  expect(states.get(added.slug)).toEqual({ status: "active", toolCount: 1 });

  // The service grows an endpoint: verify sees a new hash and recompiles —
  // the tool set, the state, AND a working connection follow.
  specVersion = 2;
  await host.refreshSpecs();
  expect(specRequests).toBe(5); // verify fetch + the recompile's own fetch
  expect(states.get(added.slug)).toEqual({ status: "active", toolCount: 2 });
  const { executor } = await host.ensure();
  const tools = await executor.tools.list();
  const fresh = tools.find((t) => t.address.includes("listThings2"));
  expect(fresh).toBeDefined();
  if (!fresh) throw new Error("unreachable");
  const result = (await executor.execute(fresh.address, {})) as {
    ok: boolean;
  };
  expect(result.ok).toBe(true);

  // A spec-host outage never downgrades the working view.
  specBroken = true;
  await host.refreshSpecs();
  expect(states.get(added.slug)).toEqual({ status: "active", toolCount: 2 });
  specBroken = false;
}, 60_000);

test("ensure() arms the verify in the background once the TTL lapses", async () => {
  specVersion = 1;
  specBroken = false;
  specRequests = 0;
  const { host, manager } = setup(0);

  await manager.add({
    kind: "openapi",
    name: "Drifty",
    spec: { kind: "url", url: `${baseUrl}/openapi.json` },
    auth: "none",
  });
  expect(specRequests).toBe(1);

  // Any use re-arms it; the sweep runs off-turn, so poll for the fetch.
  await host.ensure();
  await expect
    .poll(() => specRequests, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
});

test("blob specs are never re-fetched — they are frozen by design", async () => {
  specRequests = 0;
  const { host, manager } = setup(Number.MAX_SAFE_INTEGER);
  await manager.add({
    kind: "openapi",
    name: "Frozen",
    spec: { kind: "blob", value: specDoc(1) },
    auth: "none",
  });
  await host.refreshSpecs();
  expect(specRequests).toBe(0);
});
