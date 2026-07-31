import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { CustomIntegrationManager } from "./manager";
import { CustomIntegrationProvider, describeExecuteError } from "./provider";
import { MemoryCustomSecretStore } from "./secrets";
import { MemoryCustomIntegrationStore } from "./store";

/**
 * HOU-1052: a TRANSPORT-level failure (the server drops the socket — the
 * shape an edge that idle-closes keep-alive connections produces) REJECTS out
 * of `executor.execute` with the bare message "HTTP request failed", unlike
 * an HTTP-status failure which resolves `{ok:false}` with full detail. The
 * provider's catch used to surface only that top message, so every failing
 * POST to one API read as the same generic error with no way to diagnose it —
 * for the agent, the user, or us. These tests pin the whole story surviving.
 */

let baseUrl = "";
const server = createServer((req, res) => {
  if (req.method === "POST") {
    // RST the request — GETs keep working, mirroring the reported "reads
    // fine, every write fails" split (undici silently retries idempotent
    // GETs on a fresh connection, never a POST).
    req.socket.destroy();
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

const SPEC = () =>
  JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Flaky", version: "1.0.0" },
    servers: [{ url: baseUrl }],
    paths: {
      "/things": {
        get: {
          operationId: "listThings",
          responses: { "200": { description: "ok" } },
        },
        post: {
          operationId: "makeThing",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: { "200": { description: "ok" } },
        },
      },
    },
  });

test("a transport-failed POST surfaces the dropped-connection cause, not just 'HTTP request failed'", async () => {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  const host = new CustomExecutorHost(secrets, () => store.list());
  const manager = new CustomIntegrationManager(store, secrets, host, () => {});
  const provider = new CustomIntegrationProvider(store, host);

  const added = await manager.add({
    kind: "openapi",
    name: "Flaky",
    spec: { kind: "blob", value: SPEC() },
    auth: "none",
  });
  expect(added.state.status).toBe("active");

  const { executor } = await host.ensure();
  const tools = await executor.tools.list();
  const post = tools.find((t) => t.address.includes("makeThing"));
  const get = tools.find((t) => t.address.includes("listThings"));
  if (!post || !get) throw new Error("compiled tools missing");

  // The GET still works — the split the user actually experienced.
  const ok = await provider.execute("u", get.address, {});
  expect(ok.successful).toBe(true);

  const failed = await provider.execute("u", post.address, {
    body: { a: 1 },
  });
  expect(failed.successful).toBe(false);
  if (failed.successful) throw new Error("unreachable");
  // The generic top message is still there…
  expect(failed.error).toContain("HTTP request failed");
  // …but the cause chain now rides along, naming the real failure…
  expect(failed.error).toMatch(/other side closed|ECONNRESET|socket/i);
  // …with the honest transient-retry guidance for the model.
  expect(failed.error).toContain("safe to repeat");
}, 60_000);

test("describeExecuteError composes the cause chain and dedupes codes", () => {
  const socketErr = Object.assign(new Error("other side closed"), {
    code: "UND_ERR_SOCKET",
  });
  const fetchErr = new Error("fetch failed");
  (fetchErr as Error & { cause: unknown }).cause = socketErr;
  const transport = new Error(
    "Transport error (POST https://api.example.com/v1/search)",
  );
  (transport as Error & { cause: unknown }).cause = fetchErr;
  const top = new Error("HTTP request failed");
  (top as Error & { cause: unknown }).cause = transport;

  const described = describeExecuteError(top);
  expect(described).toContain("HTTP request failed");
  expect(described).toContain("POST https://api.example.com/v1/search");
  expect(described).toContain("other side closed (UND_ERR_SOCKET)");
  expect(described).toContain("safe to repeat");

  // A plain error (the execute timeout) passes through untouched.
  expect(describeExecuteError(new Error("the action did not respond"))).toBe(
    "the action did not respond",
  );
  // Non-Error rejections never crash the description.
  expect(describeExecuteError("boom")).toBe("boom");
  // Adjacent duplicate messages collapse.
  const dupe = new Error("same");
  (dupe as Error & { cause: unknown }).cause = new Error("same");
  expect(describeExecuteError(dupe)).toBe("same");
});
