import { expect, test } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { CustomIntegrationManager } from "./manager";
import { MemoryCustomSecretStore } from "./secrets";
import { MemoryCustomIntegrationStore } from "./store";

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
    "/widgets/{id}": {
      get: {
        operationId: "getWidget",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

const AUTH_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Vault", version: "1.0.0" },
  servers: [{ url: "https://vault.example.com" }],
  paths: {
    "/secrets": {
      get: {
        operationId: "listSecrets",
        security: [{ apiKeyAuth: [] }],
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
});

const HEADER_PARAM_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "PriceLabs", version: "1.0.0" },
  servers: [{ url: "https://api.pricelabs.example" }],
  paths: {
    "/listings": {
      get: {
        operationId: "getListings",
        parameters: [
          {
            name: "X-API-Key",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

function setup() {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  const host = new CustomExecutorHost(secrets, () => store.list());
  let changeCount = 0;
  const manager = new CustomIntegrationManager(store, secrets, host, () => {
    changeCount++;
  });
  return { store, secrets, host, manager, changes: () => changeCount };
}

test("add(openapi blob, auth:none) compiles active with tools, and fires onChanged", async () => {
  const { manager, changes } = setup();
  const view = await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
  });
  expect(view.state.status).toBe("active");
  if (view.state.status === "active") {
    expect(view.state.toolCount).toBeGreaterThanOrEqual(1);
  }
  expect(changes()).toBe(1);
});

test("add() with an already-used slug is rejected as duplicate_slug, never a silent overwrite", async () => {
  const { manager } = setup();
  await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
    slug: "widgets",
  });
  await expect(
    manager.add({
      kind: "openapi",
      name: "Widgets Again",
      spec: { kind: "blob", value: OPENAPI_SPEC },
      auth: "none",
      slug: "widgets",
    }),
  ).rejects.toMatchObject({ code: "duplicate_slug" });
});

test("add() with an invalid explicit slug is rejected before it ever reaches the executor", async () => {
  const { manager, store } = setup();
  await expect(
    manager.add({
      kind: "openapi",
      name: "Widgets",
      spec: { kind: "blob", value: OPENAPI_SPEC },
      auth: "none",
      slug: "Bad Slug!",
    }),
  ).rejects.toMatchObject({ code: "invalid_slug" });
  expect(await store.list()).toEqual([]);
});

test("add() of an MCP source the executor can't use throws compile_failed and persists NOTHING", async () => {
  const { manager, store } = setup();
  await expect(
    manager.add({
      kind: "mcp",
      name: "Ghost Server",
      endpoint: "not a valid url",
      auth: "none",
    }),
  ).rejects.toMatchObject({ code: "compile_failed" });
  expect(await store.list()).toEqual([]);
});

test("add(openapi, auth:credential) is pending until setCredential(); then active + secret stored + def.credential persisted", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  expect(added.state.status).toBe("pending");

  const updated = await manager.setCredential(added.slug, { token: "k" });
  expect(updated.state.status).toBe("active");

  expect(await secrets.get(`ci_${added.slug}_token`)).toBe("k");
  const def = (await store.list()).find((d) => d.slug === added.slug);
  expect(def?.auth).toBe("credential");
  expect(def?.credential).toEqual({
    template: expect.any(String),
    secretIds: { token: `ci_${added.slug}_token` },
  });
});

test("a spec with NO security scheme still takes a key: the fallback method places it (PriceLabs regression)", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "PriceLabs",
    spec: { kind: "blob", value: HEADER_PARAM_SPEC },
    auth: "credential",
  });
  expect(added.state.status).toBe("pending");
  if (added.state.status === "pending") {
    expect(added.state.authMethods).toHaveLength(1);
    expect(added.state.authMethods[0]?.label).toContain("X-API-Key");
  }

  const updated = await manager.setCredential(added.slug, {
    token: "plk_live_123",
  });
  expect(updated.state.status).toBe("active");
  expect(await secrets.get(`ci_${added.slug}_token`)).toBe("plk_live_123");
  const def = (await store.list()).find((d) => d.slug === added.slug);
  expect(def?.credential).toEqual({
    template: "houston_fallback",
    secretIds: { token: `ci_${added.slug}_token` },
  });
});

test("a spec with no auth hints at all falls back to Bearer and still saves", async () => {
  const { manager } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "credential",
  });
  expect(added.state.status).toBe("pending");
  if (added.state.status === "pending") {
    expect(added.state.authMethods[0]?.label).toContain("Authorization");
  }
  const updated = await manager.setCredential(added.slug, { token: "k" });
  expect(updated.state.status).toBe("active");
});

test("setCredential on a def added as auth:'none' upgrades it (request_credential after the fact)", async () => {
  const { manager, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "PriceLabs",
    spec: { kind: "blob", value: HEADER_PARAM_SPEC },
    auth: "none",
  });
  expect(added.state.status).toBe("active");

  const updated = await manager.setCredential(added.slug, { token: "k" });
  expect(updated.state.status).toBe("active");
  const def = (await store.list()).find((d) => d.slug === added.slug);
  expect(def?.auth).toBe("credential");
  expect(def?.credential?.template).toBe("houston_fallback");
});

test("a fallback-credential def survives a restart: fresh host reconnects through the re-injected template", async () => {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  const host1 = new CustomExecutorHost(secrets, () => store.list());
  const manager1 = new CustomIntegrationManager(
    store,
    secrets,
    host1,
    () => {},
  );
  const added = await manager1.add({
    kind: "openapi",
    name: "PriceLabs",
    spec: { kind: "blob", value: HEADER_PARAM_SPEC },
    auth: "credential",
  });
  await manager1.setCredential(added.slug, { token: "plk_live_123" });

  const host2 = new CustomExecutorHost(secrets, () => store.list());
  const manager2 = new CustomIntegrationManager(
    store,
    secrets,
    host2,
    () => {},
  );
  const views = await manager2.list();
  expect(views[0]?.state.status).toBe("active");
});

test("setCredential on an unknown slug is not_found; an empty value is credential_invalid", async () => {
  const { manager } = setup();
  await expect(
    manager.setCredential("never-added", { token: "k" }),
  ).rejects.toMatchObject({ code: "not_found" });

  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await expect(
    manager.setCredential(added.slug, { token: "" }),
  ).rejects.toMatchObject({ code: "credential_invalid" });
});

test("remove() deletes the definition AND its secrets; list() reflects it immediately", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });
  const secretId = `ci_${added.slug}_token`;
  expect(await secrets.get(secretId)).toBe("k");

  await manager.remove(added.slug);
  expect(await store.list()).toEqual([]);
  expect(await secrets.get(secretId)).toBeNull();
  expect(await manager.list()).toEqual([]);
});

test("list() after a FRESH CustomExecutorHost over the same stores rehydrates the same active state (restart persistence)", async () => {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  const host1 = new CustomExecutorHost(secrets, () => store.list());
  const manager1 = new CustomIntegrationManager(
    store,
    secrets,
    host1,
    () => {},
  );

  const added = await manager1.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
  });
  expect(added.state.status).toBe("active");
  const toolCount =
    added.state.status === "active" ? added.state.toolCount : -1;
  expect(toolCount).toBeGreaterThanOrEqual(1);

  const host2 = new CustomExecutorHost(secrets, () => store.list());
  const manager2 = new CustomIntegrationManager(
    store,
    secrets,
    host2,
    () => {},
  );
  const views = await manager2.list();
  expect(views).toHaveLength(1);
  expect(views[0]?.slug).toBe(added.slug);
  expect(views[0]?.state).toEqual({ status: "active", toolCount });
});

test("tools() lists exactly the active state's toolCount, names filled", async () => {
  const { manager } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
  });
  expect(added.state.status).toBe("active");
  const toolCount =
    added.state.status === "active" ? added.state.toolCount : -1;

  const tools = await manager.tools(added.slug);
  expect(tools).toHaveLength(toolCount);
  for (const tool of tools) {
    expect(tool.name.length).toBeGreaterThan(0);
  }
});

test("add() rejects the reserved 'executor' slug before touching the engine", async () => {
  const { manager } = setup();
  await expect(
    manager.add({
      kind: "mcp",
      name: "Executor",
      slug: "executor",
      endpoint: "https://mcp.example.invalid",
      auth: "none",
    }),
  ).rejects.toMatchObject({ code: "invalid_slug" });
});

test("tools() on an unknown slug throws not_found", async () => {
  const { manager } = setup();
  await expect(manager.tools("ghost")).rejects.toMatchObject({
    code: "not_found",
  });
});

test("tools() on a pending credential-mode def resolves (no throw)", async () => {
  const { manager } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  expect(added.state.status).toBe("pending");
  expect(Array.isArray(await manager.tools(added.slug))).toBe(true);
});

const AUTH_SPEC_V2 = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Vault", version: "1.1.0" },
  servers: [{ url: "https://vault.example.com" }],
  paths: {
    "/secrets": {
      get: {
        operationId: "listSecrets",
        security: [{ apiKeyAuth: [] }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/secrets/{id}": {
      get: {
        operationId: "getSecret",
        security: [{ apiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
});

test("add(replace:true) swaps the spec in place: more tools, credential kept, no re-entry (HOU-1083)", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });
  const originalAddedAt = (await store.list())[0]?.addedAtMs;

  const replaced = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC_V2 },
    auth: "credential",
    replace: true,
  });
  expect(replaced.slug).toBe(added.slug);
  expect(replaced.state).toEqual({ status: "active", toolCount: 2 });
  expect(await secrets.get(`ci_${added.slug}_token`)).toBe("k");
  const defsAfter = await store.list();
  expect(defsAfter).toHaveLength(1);
  expect(defsAfter[0]?.credential).toEqual({
    template: expect.any(String),
    secretIds: { token: `ci_${added.slug}_token` },
  });
  expect(defsAfter[0]?.addedAtMs).toBe(originalAddedAt);
});

test("add(replace:true) with a broken spec keeps the WORKING integration and fails the call", async () => {
  const { manager, store, host } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
  });
  await expect(
    manager.add({
      kind: "openapi",
      name: "Widgets",
      spec: { kind: "blob", value: "not an openapi document" },
      auth: "none",
      replace: true,
    }),
  ).rejects.toMatchObject({ code: "compile_failed" });
  const defs = await store.list();
  expect(defs).toHaveLength(1);
  expect(
    JSON.parse((defs[0] as { spec: { value: string } }).spec.value).info
      .version,
  ).toBe("1.0.0");
  const { executor, states } = await host.ensure();
  expect(states.get(added.slug)).toEqual({ status: "active", toolCount: 2 });
  const tools = await executor.tools.list();
  expect(tools.filter((t) => t.integration === added.slug)).toHaveLength(2);
});

test("add(replace:true) across kinds refuses; plain duplicate add still 409s", async () => {
  const { manager } = setup();
  await manager.add({
    kind: "openapi",
    name: "Widgets",
    spec: { kind: "blob", value: OPENAPI_SPEC },
    auth: "none",
  });
  await expect(
    manager.add({
      kind: "mcp",
      name: "Widgets",
      endpoint: "http://127.0.0.1:1/mcp",
      auth: "none",
      replace: true,
    }),
  ).rejects.toMatchObject({ code: "duplicate_slug" });
  await expect(
    manager.add({
      kind: "openapi",
      name: "Widgets",
      spec: { kind: "blob", value: OPENAPI_SPEC },
      auth: "none",
    }),
  ).rejects.toMatchObject({ code: "duplicate_slug" });
});

const AUTH_SPEC_MOVED = JSON.stringify({
  ...JSON.parse(AUTH_SPEC),
  servers: [{ url: "https://evil.example.com" }],
});

test("replace with a MOVED server origin refuses the credential carry and deletes the old secret", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });

  const replaced = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC_MOVED },
    auth: "credential",
    replace: true,
  });
  expect(replaced.state.status).toBe("pending");
  expect((await store.list())[0]?.credential).toBeUndefined();
  expect(await secrets.get(`ci_${added.slug}_token`)).toBeNull();
});

test("a same-service replace replaying auth:'none' KEEPS the working credential (spec-repair semantics)", async () => {
  const { manager, secrets, store } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });

  const replaced = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC_V2 },
    auth: "none",
    replace: true,
  });
  expect(replaced.state).toEqual({ status: "active", toolCount: 2 });
  expect(await secrets.get(`ci_${added.slug}_token`)).toBe("k");
  const def = (await store.list())[0];
  expect(def?.auth).toBe("credential");
  expect(def?.credential).toEqual({
    template: expect.any(String),
    secretIds: { token: `ci_${added.slug}_token` },
  });
});

test("concurrent replace + remove serialize: the store, secrets, and executor agree at the end", async () => {
  const { manager, secrets, store, host } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });

  const [replaceResult] = await Promise.allSettled([
    manager.add({
      kind: "openapi",
      name: "Vault",
      spec: { kind: "blob", value: AUTH_SPEC_V2 },
      auth: "credential",
      replace: true,
    }),
    manager.remove(added.slug),
  ]);
  expect(replaceResult.status).toBe("fulfilled");
  expect(await store.list()).toEqual([]);
  expect(await secrets.get(`ci_${added.slug}_token`)).toBeNull();
  const { executor, states } = await host.ensure();
  expect(states.get(added.slug)).toBeUndefined();
  const tools = await executor.tools.list();
  expect(tools.filter((t) => t.integration === added.slug)).toEqual([]);
});

const AUTH_SPEC_RENAMED_SCHEME = JSON.stringify({
  ...JSON.parse(AUTH_SPEC),
  components: {
    securitySchemes: {
      renamedAuth: { type: "apiKey", in: "header", name: "X-Other-Key" },
    },
  },
  paths: {
    "/secrets": {
      get: {
        operationId: "listSecrets",
        security: [{ renamedAuth: [] }],
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

test("a replace that fails mid-compile restores the previous working view (no half-registered slug)", async () => {
  const { manager, store, host } = setup();
  const added = await manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC },
    auth: "credential",
  });
  await manager.setCredential(added.slug, { token: "k" });

  const attempt = manager.add({
    kind: "openapi",
    name: "Vault",
    spec: { kind: "blob", value: AUTH_SPEC_RENAMED_SCHEME },
    auth: "credential",
    replace: true,
  });
  const result = await attempt.then(
    (view) => ({ kind: "resolved" as const, view }),
    (err) => ({ kind: "rejected" as const, err }),
  );
  const defs = await store.list();
  const { executor, states } = await host.ensure();
  const tools = await executor.tools.list();
  const mine = tools.filter((t) => t.integration === added.slug);
  if (result.kind === "rejected") {
    expect(result.err).toMatchObject({ code: "compile_failed" });
    expect(
      JSON.parse((defs[0] as { spec: { value: string } }).spec.value).components
        .securitySchemes.apiKeyAuth,
    ).toBeDefined();
    expect(states.get(added.slug)?.status).toBe("active");
    expect(mine.length).toBeGreaterThanOrEqual(1);
  } else {
    expect(defs).toHaveLength(1);
    expect(states.get(added.slug)?.status).toBe(result.view.state.status);
    expect(mine.length).toBeGreaterThanOrEqual(
      result.view.state.status === "active" ? 1 : 0,
    );
  }
});

test("an MCP server behind an auth wall added WITHOUT a key is an error, never 'active, 0 actions'", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((_req, res) => {
    res.statusCode = 401;
    res.setHeader("www-authenticate", "Bearer");
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    const { manager } = setup();
    await expect(
      manager.add({
        kind: "mcp",
        name: "Walled",
        endpoint: `http://127.0.0.1:${port}/mcp`,
        auth: "none",
      }),
    ).rejects.toMatchObject({
      code: "compile_failed",
      message: expect.stringMatching(/API key|sign-in|sign in/i),
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
