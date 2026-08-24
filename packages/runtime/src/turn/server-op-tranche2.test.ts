import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { zipSync } from "fflate";
import { afterEach, expect, test } from "vitest";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

/**
 * Tranche-2 pool ops (PRODUCT-1469): portable export/preview/store, the
 * desktop→cloud migration, custom integrations, the openai-compatible
 * endpoint connect, and the anonymize fallback — every remaining route a
 * sleeping agent's pod used to wake for.
 */

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const noopTurn: typeof runPiTurn = async () => ({});

async function seedAgent(): Promise<{
  storeRoot: string;
  agentId: string;
  prefix: string;
}> {
  const storeRoot = mkdtempSync(join(tmpdir(), "op2-store-"));
  const prefix = "ws/w1/agent-1";
  const workspaces = join(storeRoot, prefix, "workspaces");
  const store = new LocalWorkspaceStore(workspaces);
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Bob" });
  const agentDir = join(workspaces, ...agent.id.split("/"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Bob instructions\n");
  return { storeRoot, agentId: agent.id, prefix };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

function opBody(heartbeatUrl: string, op: unknown) {
  return {
    workspaceId: "w1",
    agentId: "agent-1",
    gcsPrefix: "ws/w1/agent-1",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl,
    },
    actingAs: { userId: "user-1" },
    triggersEnabled: false,
    op,
  };
}

async function postOp(base: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (response.status !== 503 || json.error !== "worker_full" || attempt > 40)
      return { status: response.status, json };
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("portable/preview runs as a read op and inventories CLAUDE.md", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "portable/preview",
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  const preview = JSON.parse(json.body as string) as {
    claudeMd: { excerpt: string } | null;
    skills: unknown[];
  };
  expect(preview.claudeMd?.excerpt).toContain("Bob instructions");
  expect(preview.skills).toEqual([]);
});

test("portable/export answers the zip base64 with its download header", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "portable/export",
      contentType: "application/json",
      body: JSON.stringify({ claudeMd: true }),
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(typeof json.bodyBase64).toBe("string");
  expect(
    String(
      (json.headers as Record<string, string> | undefined)?.[
        "content-disposition"
      ] ?? "",
    ),
  ).toContain(".houstonagent");
});

test("portable/store-publication round-trips through the op path and syncs the pointer", async () => {
  const { storeRoot, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const hb = await heartbeatOK();
  let { json } = await postOp(
    base,
    opBody(hb, {
      kind: "route",
      method: "POST",
      rest: "portable/store-publication",
      contentType: "application/json",
      body: JSON.stringify({
        storeAgentId: "sa-1",
        slug: "bob",
        shareUrl: "https://agents.example/bob",
      }),
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  const synced = await store.list(prefix);
  expect(
    synced.some((k) => k.endsWith("/store-publication.json")),
    synced.join("\n"),
  ).toBe(true);
  ({ json } = await postOp(
    base,
    opBody(hb, {
      kind: "route",
      method: "GET",
      rest: "portable/store-publication",
    }),
  ));
  const read = JSON.parse(json.body as string) as {
    pointer: { slug: string } | null;
  };
  expect(read.pointer?.slug).toBe("bob");
});

test("migration status/complete run as ops; the marker syncs and reads back", async () => {
  const { storeRoot, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const hb = await heartbeatOK();
  let { json } = await postOp(
    base,
    opBody(hb, { kind: "route", method: "GET", rest: "migration/status" }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(JSON.parse(json.body as string)).toEqual({ imported: null });
  ({ json } = await postOp(
    base,
    opBody(hb, {
      kind: "route",
      method: "POST",
      rest: "migration/complete",
      contentType: "application/json",
      body: JSON.stringify({ source: "desktop", counts: { files: 2 } }),
    }),
  ));
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(
    (await store.list(prefix)).some((k) =>
      k.endsWith("/.houston/migration/imported.json"),
    ),
  ).toBe(true);
  ({ json } = await postOp(
    base,
    opBody(hb, { kind: "route", method: "GET", rest: "migration/status" }),
  ));
  const status = JSON.parse(json.body as string) as {
    imported: { source: string } | null;
  };
  expect(status.imported?.source).toBe("desktop");
});

test("a migration import without runtime entries applies on the worker (bodyBase64)", async () => {
  const { storeRoot, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const zip = zipSync({
    "CLAUDE.md": new TextEncoder().encode("# migrated instructions\n"),
    "files/notes.txt": new TextEncoder().encode("hello\n"),
  });
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "migration/import",
      contentType: "application/zip",
      query: "overwrite=1",
      bodyBase64: Buffer.from(zip).toString("base64"),
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.decline).toBeUndefined();
  const result = JSON.parse(json.body as string) as { written: number };
  expect(result.written).toBe(2);
  const synced = await store.list(prefix);
  expect(synced.some((k) => k.endsWith("/files/notes.txt"))).toBe(true);
});

test("a migration import carrying runtime transcripts declines to the pod", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const zip = zipSync({
    ".houston/runtime/conversations/c9.json": new TextEncoder().encode("{}"),
  });
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "migration/import",
      contentType: "application/zip",
      bodyBase64: Buffer.from(zip).toString("base64"),
    }),
  );
  expect(json.ok).toBe(true);
  expect(json.decline).toBe(true);
});

test("anonymize with no credential ships the regex-only result with the reason, never a decline", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "anonymize",
      input: { claudeMd: true },
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.decline).toBeUndefined();
  const body = JSON.parse(json.body as string) as {
    mode: string;
    aiError?: string;
  };
  expect(body.mode).toBe("patterns");
  expect(body.aiError).toContain("AI anonymization is not available");
});

test("anonymize with useAi:false is a clean patterns run (no aiError)", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "anonymize",
      input: { claudeMd: true, useAi: false },
    }),
  );
  expect(json.status).toBe(200);
  const body = JSON.parse(json.body as string) as {
    mode: string;
    aiError?: string;
  };
  expect(body.mode).toBe("patterns");
  expect(body.aiError).toBeUndefined();
});

/** The gateway double: heartbeat + credential PUT + shared-endpoint PUT/DELETE. */
function fakeGateway(recorded: {
  credentials: { path: string; body: string }[];
  shared: { method: string; ownerOnly: string }[];
}): Server {
  return createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      if (req.url?.startsWith("/v1/pod/credentials/")) {
        recorded.credentials.push({ path: req.url, body });
      } else if (req.url?.startsWith("/v1/pod/shared-endpoint/")) {
        recorded.shared.push({
          method: req.method ?? "",
          ownerOnly: String(req.headers["x-houston-owner-only"] ?? ""),
        });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
}

test("an endpoint connect writes custom-endpoint.json, pushes the key, and publishes the share", async () => {
  const { storeRoot, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const recorded = { credentials: [], shared: [] } as Parameters<
    typeof fakeGateway
  >[0];
  const gateway = await listen(fakeGateway(recorded));
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(`${gateway}/hb`, {
      kind: "settings",
      action: "endpoint",
      input: {
        baseUrl: "https://models.example.com",
        model: "llama-3.3-70b",
        shared: true,
        apiKey: "sk-local",
      },
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(JSON.parse(json.body as string)).toEqual({ ok: true });
  // The endpoint config synced back beside settings.json.
  const synced = await store.list(prefix);
  expect(
    synced.some((k) => k.endsWith("/.houston/runtime/custom-endpoint.json")),
  ).toBe(true);
  // The key landed in the credential store under the provider id...
  expect(recorded.credentials).toHaveLength(1);
  expect(recorded.credentials[0]?.path).toContain("/openai-compatible");
  expect(JSON.parse(recorded.credentials[0]?.body ?? "{}")).toMatchObject({
    kind: "api_key",
    access: "sk-local",
  });
  // ...and the org share was published.
  expect(recorded.shared).toEqual([{ method: "PUT", ownerOnly: "" }]);
});

test("an unshared endpoint connect withdraws the owner's share; a private URL never leaves the worker", async () => {
  const { storeRoot } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const recorded = { credentials: [], shared: [] } as Parameters<
    typeof fakeGateway
  >[0];
  const gateway = await listen(fakeGateway(recorded));
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  let { json } = await postOp(
    base,
    opBody(`${gateway}/hb`, {
      kind: "settings",
      action: "endpoint",
      input: { baseUrl: "https://models.example.com", model: "m" },
    }),
  );
  expect(json.status).toBe(200);
  expect(recorded.shared).toEqual([{ method: "DELETE", ownerOnly: "1" }]);
  // Managed-cloud egress guard: a localhost endpoint answers the pod's own
  // 400 reason — nothing is written, nothing pushed.
  ({ json } = await postOp(
    base,
    opBody(`${gateway}/hb`, {
      kind: "settings",
      action: "endpoint",
      input: { baseUrl: "http://127.0.0.1:11434", model: "m" },
    }),
  ));
  expect(json.status).toBe(400);
  expect(String(JSON.parse(json.body as string).error)).toContain(
    "public HTTPS",
  );
  expect(recorded.credentials).toHaveLength(1); // still only the first connect
});

test("an azure api-key connect validates the endpoint on the worker (no more dropped-field 400s)", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  // A malformed endpoint fails the offline preconditions with azure's own
  // reason — proving the endpoint field now rides the op at all.
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "credential",
      action: "api-key",
      provider: "azure-openai-responses",
      apiKey: "sk-azure",
      endpoint: "not a url",
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(400);
  expect(String(JSON.parse(json.body as string).error)).toContain(
    "not a valid URL",
  );
});

test("custom-integration definitions list runs on the worker over the store-root file", async () => {
  const { storeRoot } = await seedAgent();
  // A pre-existing definitions file at the STORE ROOT (beside workspaces/):
  // the op must read THIS file, not an empty default.
  writeFileSync(
    join(storeRoot, "ws/w1/agent-1", "custom-integrations.json"),
    JSON.stringify({
      version: 1,
      items: [],
    }),
  );
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "integrations/custom/definitions",
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(JSON.parse(json.body as string)).toEqual({ items: [] });
});

test("adding an OAuth custom integration declines to the pod (its callback, its state)", async () => {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "integrations/custom/definitions",
      contentType: "application/json",
      body: JSON.stringify({
        kind: "mcp",
        name: "Linear",
        endpoint: "https://mcp.linear.app/mcp",
        auth: "oauth",
      }),
    }),
  );
  expect(json.ok).toBe(true);
  expect(json.decline).toBe(true);
});

// Minimal, valid OpenAPI 3.0 document — enough for the executor to compile
// (title/servers/paths with operationIds). No security scheme, so
// `auth: "none"` connects immediately, no network.
const OPENAPI_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Widgets", version: "1.0.0" },
  servers: [{ url: "https://widgets.example.com" }],
  paths: {
    "/widgets": {
      get: {
        operationId: "listWidgets",
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

test("adding a keyless custom integration compiles on the worker, syncs the store-root file, and announces", async () => {
  const { storeRoot, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "integrations/custom/definitions",
      contentType: "application/json",
      body: JSON.stringify({
        kind: "openapi",
        name: "Widgets",
        spec: OPENAPI_SPEC,
        auth: "none",
      }),
    }),
  );
  expect(json.status, JSON.stringify(json)).toBe(200);
  const view = JSON.parse(json.body as string) as {
    slug: string;
    state: { status: string };
  };
  expect(view.slug).toBe("widgets");
  expect(view.state.status).toBe("active");
  // The definitions file lives at the STORE-PREFIX ROOT (beside workspaces/),
  // and the widened include carried it back.
  const synced = await store.list(prefix);
  expect(synced, synced.join("\n")).toContain(
    "ws/w1/agent-1/custom-integrations.json",
  );
  // The mutation announces like the pod's own emit.
  expect(json.events).toContain("CustomIntegrationsChanged");
});
