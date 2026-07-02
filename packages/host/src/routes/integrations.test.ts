import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
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
    reconnectNotice?: boolean;
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
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: withIntegrations
      ? {
          registry: new IntegrationRegistry([fake]),
          ...(opts.reconnectNotice ? { reconnectNotice: true } : {}),
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
  return { base, ws, vault, fake, stop: () => server.close() };
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

test("a legacy for-you credentials file surfaces the one-time reconnect notice", async () => {
  const { base, stop } = await setup({ reconnectNotice: true });
  try {
    const status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items[0]).toMatchObject({ reconnect: true });
  } finally {
    stop();
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

test("no session sink (cloud) → PUT session 404s", async () => {
  const { base, stop } = await setup();
  try {
    const res = await fetch(`${base}/v1/integrations/session`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ token: "jwt" }),
    });
    expect(res.status).toBe(404);
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
      body: JSON.stringify({ toolkit: "gmail" }),
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
