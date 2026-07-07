import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
import { IntegrationUpstreamError } from "../integrations/types";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The host integration surface end-to-end over real HTTP: the user routes
 * (`/v1/integrations/*`) and the runtime-facing HMAC proxy
 * (`/sandbox/integrations/*`), driven against an in-memory fake provider so the
 * routing/auth logic is verified without a live Composio. Platform model: no
 * provider login — users only connect toolkits, keyed by their Houston userId.
 */

const USER = "alice";
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: ["composio"],
};

async function setup(
  opts: {
    withIntegrations?: boolean;
    withCustom?: boolean;
    reconnectNotice?: {
      active(): boolean;
      dismiss(): void | Promise<void>;
    };
    session?: { set(token: string | null): void };
  } = {},
) {
  const withIntegrations = opts.withIntegrations ?? true;
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const fake = new FakeIntegrationProvider({ id: "composio" });
  // A second provider whose one action is a custom HTTP request, and which
  // implements CustomIntegrationHost (create/update), so the fan-out + routing
  // and the create/update passthrough can be driven end-to-end.
  const custom = new FakeIntegrationProvider({
    id: "custom",
    custom: true,
    actions: [
      { action: "CUSTOM_ACME_REQUEST", toolkit: "acme", description: "acme" },
    ],
  });
  const providers = opts.withCustom ? [fake, custom] : [fake];
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: withIntegrations
      ? {
          registry: new IntegrationRegistry(providers),
          ...(opts.reconnectNotice
            ? { reconnectNotice: opts.reconnectNotice }
            : {}),
          ...(opts.session ? { session: opts.session } : {}),
        }
      : undefined,
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  return { base, ws, vault, fake, custom, stop: () => server.close() };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};

test("status reports readiness (no login concept, no account, no secret)", async () => {
  const { base, fake, stop } = await setup();
  try {
    let status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status).toEqual({ items: [{ provider: "composio", ready: true }] });

    fake.setNotReady();
    status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status).toEqual({
      items: [{ provider: "composio", ready: false, reason: "signin" }],
    });
  } finally {
    stop();
  }
});

test("a legacy for-you credentials file surfaces the one-time reconnect notice, and dismiss deletes it", async () => {
  // A real legacy file on disk (the local profile's wiring shape: active() is
  // a live existsSync, dismiss() an idempotent rm) — so the test proves the
  // retired plaintext-key file is actually deleted and the flag clears live.
  const dir = mkdtempSync(join(tmpdir(), "houston-legacy-integrations-"));
  const legacyPath = join(dir, "integrations.json");
  writeFileSync(legacyPath, JSON.stringify({ apiKey: "legacy-plaintext-key" }));
  const { base, stop } = await setup({
    reconnectNotice: {
      active: () => existsSync(legacyPath),
      dismiss: () => rmSync(legacyPath, { force: true }),
    },
  });
  try {
    let status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items[0]).toMatchObject({ reconnect: true });

    const dismiss = await fetch(
      `${base}/v1/integrations/reconnect-notice/dismiss`,
      { method: "POST", headers: auth },
    );
    expect(dismiss.status).toBe(200);
    expect(await dismiss.json()).toEqual({ ok: true });
    expect(existsSync(legacyPath)).toBe(false);

    // The flag reflects reality immediately — no host restart.
    status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items[0].reconnect).toBeUndefined();

    // Idempotent: dismissing an already-gone file is still a 200.
    const again = await fetch(
      `${base}/v1/integrations/reconnect-notice/dismiss`,
      { method: "POST", headers: auth },
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
  } finally {
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dismiss with no legacy path wired (cloud) is a no-op success; a deletion failure surfaces", async () => {
  const cloud = await setup();
  try {
    const res = await fetch(
      `${cloud.base}/v1/integrations/reconnect-notice/dismiss`,
      { method: "POST", headers: auth },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  } finally {
    cloud.stop();
  }

  // A real failure (e.g. EACCES) must NOT be swallowed behind {ok:true}.
  const failing = await setup({
    reconnectNotice: {
      active: () => true,
      dismiss: () => {
        throw new Error("EACCES: permission denied");
      },
    },
  });
  try {
    const res = await fetch(
      `${failing.base}/v1/integrations/reconnect-notice/dismiss`,
      { method: "POST", headers: auth },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("EACCES");
  } finally {
    failing.stop();
  }
});

test("the frontend keeps the gateway session fresh via PUT /v1/integrations/session", async () => {
  const seen: (string | null)[] = [];
  const { base, stop } = await setup({
    session: { set: (t) => seen.push(t) },
  });
  try {
    const put = (token: unknown) =>
      fetch(`${base}/v1/integrations/session`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ token }),
      });
    expect((await put("jwt-1")).status).toBe(200);
    expect((await put(null)).status).toBe(200);
    expect((await put(42)).status).toBe(400);
    expect(seen).toEqual(["jwt-1", null]);
  } finally {
    stop();
  }
});

test("no session sink (cloud) → PUT session is a no-op", async () => {
  const { base, stop } = await setup();
  try {
    const res = await fetch(`${base}/v1/integrations/session`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ token: "jwt" }),
    });
    expect(res.status).toBe(200);
  } finally {
    stop();
  }
});

test("no integrations configured → PUT session is still a no-op", async () => {
  const { base, stop } = await setup({ withIntegrations: false });
  try {
    const res = await fetch(`${base}/v1/integrations/session`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ token: "jwt" }),
    });
    expect(res.status).toBe(200);
  } finally {
    stop();
  }
});

test("toolkits/connect/poll/disconnect — the full OAuth hand-off, no provider account", async () => {
  const { base, fake, stop } = await setup();
  try {
    const toolkits = await (
      await fetch(`${base}/v1/integrations/composio/toolkits`, {
        headers: auth,
      })
    ).json();
    expect(toolkits.items.map((t: { slug: string }) => t.slug)).toContain(
      "gmail",
    );

    const connect = (await (
      await fetch(`${base}/v1/integrations/composio/connect`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ toolkit: "gmail" }),
      })
    ).json()) as { redirectUrl: string; connectionId: string };
    expect(connect.redirectUrl).toContain("gmail");

    // Pending until the user finishes the OAuth in the browser…
    let conn = await (
      await fetch(
        `${base}/v1/integrations/composio/connections/${connect.connectionId}`,
        { headers: auth },
      )
    ).json();
    expect(conn.status).toBe("pending");

    // …then the poll sees it active.
    fake.completeConnection(USER, connect.connectionId);
    conn = await (
      await fetch(
        `${base}/v1/integrations/composio/connections/${connect.connectionId}`,
        { headers: auth },
      )
    ).json();
    expect(conn.status).toBe("active");

    const conns = await (
      await fetch(`${base}/v1/integrations/composio/connections`, {
        headers: auth,
      })
    ).json();
    expect(conns.items.map((c: { toolkit: string }) => c.toolkit)).toEqual([
      "gmail",
    ]);

    await fetch(`${base}/v1/integrations/composio/disconnect`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ connectionId: connect.connectionId }),
    });
    expect(
      (
        await (
          await fetch(`${base}/v1/integrations/composio/connections`, {
            headers: auth,
          })
        ).json()
      ).items,
    ).toEqual([]);

    // Polling a vanished connection 404s.
    expect(
      (
        await fetch(`${base}/v1/integrations/composio/connections/nope`, {
          headers: auth,
        })
      ).status,
    ).toBe(404);
  } finally {
    stop();
  }
});

test("user-facing search/execute exist (the desktop gateway forwards here)", async () => {
  const { base, stop } = await setup();
  try {
    const search = await (
      await fetch(`${base}/v1/integrations/composio/search`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ query: "send an email" }),
      })
    ).json();
    expect(search.items.map((m: { action: string }) => m.action)).toContain(
      "GMAIL_SEND_EMAIL",
    );

    const exec = await (
      await fetch(`${base}/v1/integrations/composio/execute`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          action: "GMAIL_SEND_EMAIL",
          params: { to: "a@b.com" },
        }),
      })
    ).json();
    expect(exec.successful).toBe(true);
  } finally {
    stop();
  }
});

test("user-facing execute forwards the chosen account verbatim (gateway resolves)", async () => {
  const { base, fake, stop } = await setup();
  try {
    const res = await fetch(`${base}/v1/integrations/composio/execute`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", account: "acc-1" }),
    });
    expect(res.status).toBe(200);
    expect(fake.lastAccount).toBe("acc-1");
  } finally {
    stop();
  }
});

test("disconnect requires a connectionId; rename validates the alias length", async () => {
  const { base, fake, stop } = await setup();
  try {
    const { connectionId } = await fake.connect(USER, "gmail");
    fake.completeConnection(USER, connectionId);

    // disconnect: missing connectionId → 400.
    const noId = await fetch(`${base}/v1/integrations/composio/disconnect`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({}),
    });
    expect(noId.status).toBe(400);

    // rename: empty / over-long aliases → 400; a valid one persists.
    const rename = (alias: unknown) =>
      fetch(
        `${base}/v1/integrations/composio/connections/${connectionId}/rename`,
        { method: "POST", headers: auth, body: JSON.stringify({ alias }) },
      );
    expect((await rename("   ")).status).toBe(400);
    expect((await rename("x".repeat(65))).status).toBe(400);
    const ok = await rename("  Work  ");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const conn = await (
      await fetch(
        `${base}/v1/integrations/composio/connections/${connectionId}`,
        { headers: auth },
      )
    ).json();
    expect(conn.accountLabel).toBe("Work"); // trimmed
  } finally {
    stop();
  }
});

test("unknown provider 404s; no auth 401s", async () => {
  const { base, stop } = await setup();
  try {
    expect(
      (await fetch(`${base}/v1/integrations/nope/toolkits`, { headers: auth }))
        .status,
    ).toBe(404);
    expect((await fetch(`${base}/v1/integrations`)).status).toBe(401);
  } finally {
    stop();
  }
});

test("sandbox proxy: HMAC token → workspace owner's userId → execute/search", async () => {
  const { base, ws, vault, stop } = await setup();
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);

    const exec = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "GMAIL_SEND_EMAIL",
        params: { to: "a@b.com" },
      }),
    });
    expect(exec.status).toBe(200);
    expect((await exec.json()).successful).toBe(true);

    const search = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "send an email" }),
    });
    expect(
      (await search.json()).items.map((m: { action: string }) => m.action),
    ).toContain("GMAIL_SEND_EMAIL");
  } finally {
    stop();
  }
});

test("sandbox proxy: forwards the C2 acting headers into the provider (absent → undefined)", async () => {
  const { base, ws, vault, fake, stop } = await setup();
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const call = (headers: Record<string, string>) =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
      });

    // An acting-as token rides through verbatim.
    await call({ "x-houston-acting-as": "acting-v1.tok" });
    expect(fake.lastActing).toEqual({
      actingAs: "acting-v1.tok",
      actingUser: undefined,
    });

    // A routine's acting-user rides through.
    await call({ "x-houston-acting-user": "sub-123" });
    expect(fake.lastActing).toEqual({
      actingAs: undefined,
      actingUser: "sub-123",
    });

    // Neither header (today's desktop path) → no acting context at all.
    await call({});
    expect(fake.lastActing).toBeUndefined();
  } finally {
    stop();
  }
});

test("sandbox proxy: bad token 401; a signed-out gateway surfaces 409 signin_required", async () => {
  const { base, ws, vault, fake, stop } = await setup();
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);

    expect(
      (
        await fetch(`${base}/sandbox/integrations/execute`, {
          method: "POST",
          headers: {
            Authorization: "Bearer nope",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "X" }),
        })
      ).status,
    ).toBe(401);

    fake.throwSigninRequired = true;
    const res = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "X" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("signin_required");
  } finally {
    stop();
  }
});

test("integration routes relay upstream policy status and body", async () => {
  const { base, ws, vault, fake, stop } = await setup();
  const body = { error: "not granted", code: "integration_grant_required" };
  fake.throwSearchExecute = new IntegrationUpstreamError(403, body);
  try {
    const user = await fetch(`${base}/v1/integrations/composio/execute`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
    });
    expect(user.status).toBe(403);
    expect(await user.json()).toEqual(body);

    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const sandbox = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
    });
    expect(sandbox.status).toBe(403);
    expect(await sandbox.json()).toEqual(body);
  } finally {
    stop();
  }
});

// ── Custom (per-user API-key) integrations: fan-out, routing, passthrough ────

test("GET /v1/integrations lists every provider (composio + custom)", async () => {
  const { base, stop } = await setup({ withCustom: true });
  try {
    const status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items).toEqual([
      { provider: "composio", ready: true },
      { provider: "custom", ready: true },
    ]);
  } finally {
    stop();
  }
});

test("sandbox search fans out over providers, tagging each match with its provider", async () => {
  const { base, ws, vault, stop } = await setup({ withCustom: true });
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "" }),
    });
    const items = (await res.json()).items as {
      action: string;
      provider: string;
    }[];
    expect(items.map((i) => [i.action, i.provider]).sort()).toEqual([
      ["CUSTOM_ACME_REQUEST", "custom"],
      ["GMAIL_SEND_EMAIL", "composio"],
    ]);
  } finally {
    stop();
  }
});

test("sandbox execute routes a CUSTOM_ action to the custom provider, others to composio", async () => {
  const { base, ws, vault, fake, custom, stop } = await setup({
    withCustom: true,
  });
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const run = (action: string) =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, params: {} }),
      });

    await run("CUSTOM_ACME_REQUEST");
    expect(custom.lastExecutedAction).toBe("CUSTOM_ACME_REQUEST");
    expect(fake.lastExecutedAction).toBeUndefined();

    await run("GMAIL_SEND_EMAIL");
    expect(fake.lastExecutedAction).toBe("GMAIL_SEND_EMAIL");
  } finally {
    stop();
  }
});

test("POST /v1/integrations/custom/create forwards to the provider and returns {connection}", async () => {
  const { base, custom, stop } = await setup({ withCustom: true });
  try {
    const res = await fetch(`${base}/v1/integrations/custom/create`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "Acme",
        baseUrl: "https://api.acme.test",
        auth: { type: "header", header: "Authorization", prefix: "Bearer " },
        description: "Acme CRM",
        apiKey: "sk-secret",
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).connection).toEqual({
      toolkit: "acme",
      connectionId: "acme",
      status: "active",
      accountLabel: "Acme",
    });
    // The integration is now one of the user's connections.
    expect(await custom.listConnections(USER)).toHaveLength(1);
  } finally {
    stop();
  }
});

test("POST /v1/integrations/custom/update renames but keeps the slug/connectionId", async () => {
  const { base, custom, stop } = await setup({ withCustom: true });
  try {
    await custom.createCustom?.(USER, {
      name: "Acme",
      baseUrl: "https://api.acme.test",
      auth: { type: "header", header: "Authorization" },
      description: "d",
      apiKey: "k",
    });
    const res = await fetch(`${base}/v1/integrations/custom/update`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ connectionId: "acme", name: "Acme Renamed" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).connection).toMatchObject({
      connectionId: "acme",
      accountLabel: "Acme Renamed",
    });
  } finally {
    stop();
  }
});

test("create/update 404 on a provider that does not support custom integrations", async () => {
  const { base, stop } = await setup({ withCustom: true });
  try {
    const res = await fetch(`${base}/v1/integrations/composio/create`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});

test("integration routes 503 when integrations are not configured", async () => {
  const { base, stop } = await setup({ withIntegrations: false });
  try {
    expect(
      (await fetch(`${base}/v1/integrations`, { headers: auth })).status,
    ).toBe(503);
  } finally {
    stop();
  }
});
