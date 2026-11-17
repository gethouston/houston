import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustomIntegrationState } from "@houston/host/src/integrations/custom/types";
import {
  LocalDirStore,
  ObjectTooLargeError,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";

vi.mock("@houston/host/src/integrations/custom/executor-host", () => ({
  TOKEN_VARIABLE: "token",
  CustomExecutorHost: class {
    states = new Map<string, CustomIntegrationState>();
    async ensure() {
      return {
        executor: {
          integrations: { detect: async () => [] },
          mcp: {
            probeEndpoint: async () => ({
              requiresAuthentication: true,
              requiresOAuth: true,
              slug: "acme",
            }),
          },
        },
        states: this.states,
      };
    }
    async authMethods() {
      return [{ template: "bearer", label: "Token", fields: [] }];
    }
    async reconnect() {}
    async connectedState() {
      return { status: "active", toolCount: 1 };
    }
    async reset() {}
  },
}));

vi.mock("./turn-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("./turn-store")>();
  return {
    ...original,
    resolveTurnStore: (turn: { gcsPrefix: string }, fallback: unknown) => ({
      store: fallback,
      prefix: turn.gcsPrefix,
    }),
  };
});

const callbackUrl =
  "https://gateway.example/v1/integrations/custom/oauth/callback";
const prefix = "ws/0123456789abcdef/abcdef0123456789";
const endpoint = "https://mcp.example/mcp";
const issuer = "https://auth.example";
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0))
    await new Promise<void>((r) => s.close(() => r()));
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const response = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json" },
  });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "oauth-worker-test-"));
  roots.push(root);
  const dir = join(root, prefix);
  await mkdir(join(dir, "workspaces/w1/a1/.houston"), { recursive: true });
  await writeFile(
    join(dir, "workspaces/w1/a1/.houston/agent.json"),
    JSON.stringify({ id: "a1", name: "Agent", createdAtMs: 1 }),
  );
  const def = {
    kind: "mcp",
    slug: "acme",
    name: "Acme",
    endpoint,
    auth: "oauth",
    addedAtMs: 1,
  };
  await writeFile(
    join(dir, "custom-integrations.json"),
    JSON.stringify({ version: 1, items: [def] }),
  );
  const secrets = new Map<string, string>();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = String(init?.body ?? "");
    calls.push({ url, body });
    if (url.includes("oauth-protected-resource"))
      return response({ resource: endpoint, authorization_servers: [issuer] });
    if (
      url.includes("oauth-authorization-server") ||
      url.includes("openid-configuration")
    )
      return response({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    if (url === `${issuer}/register`)
      return response({ ...JSON.parse(body), client_id: "worker-client" }, 201);
    if (url === `${issuer}/token`)
      return response({
        access_token: "access-test",
        refresh_token: "refresh-test",
        token_type: "Bearer",
      });
    if (url.includes("/custom-secrets/")) {
      if (init?.method === "PUT") {
        secrets.set(url, JSON.parse(body).value);
        return response({});
      }
      return secrets.has(url)
        ? response({ value: secrets.get(url) })
        : response({}, 404);
    }
    if (url.includes("/docs/"))
      return init?.method === "PUT" ? response({ rev: 1 }) : response({}, 404);
    return response({});
  };
  const store = new LocalDirStore(root);
  const server = createTurnServer({
    store,
    token: "",
    runTurn: async () => ({}),
    fetchImpl,
    heartbeatIntervalMs: 60_000,
    poolStoreUrl: "https://gateway.example",
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  const post = async (op: unknown, supported = true) => {
    for (let tries = 0; ; tries++) {
      const res = await fetch(`http://127.0.0.1:${addr.port}/op`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "w1",
          agentId: "abcdef0123456789",
          gcsPrefix: prefix,
          hostToken: "test-host",
          claim: {
            id: "1",
            bootId: "1",
            token: "claim",
            heartbeatUrl: "https://gateway.example/hb",
          },
          ...(supported ? { customOAuthCallbackUrl: callbackUrl } : {}),
          op,
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (res.status !== 503 || json.error !== "worker_full" || tries > 40)
        return { status: res.status, json };
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { dir, def, post, secrets, calls, store };
}

test("OAuth start is read-only; complete exchanges into remote custody, syncs, captures and announces", async () => {
  const { post, dir, secrets, calls } = await setup();
  const before = await readFile(join(dir, "custom-integrations.json"), "utf8");
  const start = await post({
    kind: "custom-oauth",
    action: "start",
    slug: "acme",
    callbackUrl,
    statePrefix: "untrusted",
  });
  expect(start.json.status, JSON.stringify(start.json)).toBe(200);
  const prepared = JSON.parse(String(start.json.body));
  expect(prepared.state).toMatch(
    /^0123456789abcdef\.abcdef0123456789\.[a-f0-9]{32}$/,
  );
  expect(new URL(prepared.authorizeUrl).searchParams.get("state")).toBe(
    prepared.state,
  );
  expect(secrets.size).toBe(0);
  expect(await readFile(join(dir, "custom-integrations.json"), "utf8")).toBe(
    before,
  );
  expect(start.json.events).toEqual([]);
  expect(calls.some((c) => c.url.includes("/docs/") && c.body)).toBe(false);
  const complete = await post({
    kind: "custom-oauth",
    action: "complete",
    attempt: prepared.attempt,
    code: "code-test",
  });
  expect(complete.json.status, JSON.stringify(complete.json)).toBe(200);
  expect(JSON.parse(String(complete.json.body)).state.status).toBe("active");
  expect(complete.json.events).toContain("CustomIntegrationsChanged");
  expect(JSON.parse([...secrets.values()][0] ?? "{}").tokens.access_token).toBe(
    "access-test",
  );
  expect(
    JSON.parse(await readFile(join(dir, "custom-integrations.json"), "utf8"))
      .items[0].credential.secretIds.token,
  ).toBe("ci_acme_token");
  const exchange = calls.find((c) => c.url === `${issuer}/token`);
  expect(new URLSearchParams(exchange?.body).get("code_verifier")).toBe(
    prepared.attempt.codeVerifier,
  );
  expect(
    calls.some(
      (c) => c.url.includes("custom_definitions") && c.body.includes("acme"),
    ),
  ).toBe(true);
});

test("manager refusals use the pod's error mapping; changed endpoint never exchanges", async () => {
  const { post, dir, def, calls, secrets } = await setup();
  const absent = await post({
    kind: "custom-oauth",
    action: "start",
    slug: "missing",
    callbackUrl,
  });
  expect(absent.json.status).toBe(404);
  expect(JSON.parse(String(absent.json.body))).toEqual({
    error: "no custom integration 'missing'",
    code: "not_found",
  });
  const start = await post({
    kind: "custom-oauth",
    action: "start",
    slug: "acme",
    callbackUrl,
  });
  const prepared = JSON.parse(String(start.json.body));
  await writeFile(
    join(dir, "custom-integrations.json"),
    JSON.stringify({
      version: 1,
      items: [{ ...def, endpoint: "https://changed.example/mcp" }],
    }),
  );
  const complete = await post({
    kind: "custom-oauth",
    action: "complete",
    attempt: prepared.attempt,
    code: "code-test",
  });
  expect(complete.json.status).toBe(400);
  expect(JSON.parse(String(complete.json.body)).code).toBe(
    "oauth_state_invalid",
  );
  expect(calls.some((c) => c.url === `${issuer}/token`)).toBe(false);
  expect(secrets.size).toBe(0);
});

test("invalid attempts fail before any worker-side use", async () => {
  const { post, calls } = await setup();
  const invalid = await post({
    kind: "custom-oauth",
    action: "complete",
    attempt: { slug: "acme" },
    code: "code-test",
  });
  expect(invalid.status).toBe(400);
  expect(invalid.json.error).toBe("invalid 'op.attempt'");
  expect(calls).toEqual([]);
});

test.each([
  new Error("store unavailable"),
  new ObjectTooLargeError("custom-integrations.json", "size cap"),
])(
  "a secret already stored makes a failed definition sync ambiguous: %s",
  async (error) => {
    const { post, store, secrets } = await setup();
    const start = await post({
      kind: "custom-oauth",
      action: "start",
      slug: "acme",
      callbackUrl,
    });
    const { attempt } = JSON.parse(String(start.json.body));
    vi.spyOn(store, "upload").mockRejectedValue(error);
    const complete = await post({
      kind: "custom-oauth",
      action: "complete",
      attempt,
      code: "code-test",
    });
    expect(complete.json).toEqual({ ok: true, ambiguous: true });
    expect(secrets.size).toBe(1);
  },
);

test.each([false, true])(
  "OAuth detection uses the gateway callback capability=%s",
  async (supported) => {
    const { post } = await setup();
    const detected = await post(
      {
        kind: "route",
        method: "POST",
        rest: "integrations/custom/detect",
        contentType: "application/json",
        body: JSON.stringify({ url: endpoint }),
      },
      supported,
    );
    if (supported) {
      expect(detected.json.status).toBe(200);
      expect(JSON.parse(String(detected.json.body))).toMatchObject({
        requiresOAuth: true,
        oauthSupported: true,
      });
      expect(detected.json.decline).toBeUndefined();
    } else expect(detected.json.decline).toBe(true);
  },
);
