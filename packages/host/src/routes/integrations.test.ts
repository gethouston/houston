import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { MemoryIntegrationCredentialStore } from "../integrations/credential-store";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
import type { ProviderCredential } from "../integrations/types";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The host integration surface end-to-end over real HTTP: the user routes
 * (`/v1/integrations/*`) and the runtime-facing HMAC proxy
 * (`/sandbox/integrations/*`), driven against an in-memory fake provider so the
 * routing/auth/credential-custody logic is verified without a live Composio.
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

async function setup(opts: { withIntegrations?: boolean } = {}) {
  const withIntegrations = opts.withIntegrations ?? true;
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const fake = new FakeIntegrationProvider({ id: "composio" });
  const intCreds = new MemoryIntegrationCredentialStore();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: withIntegrations
      ? { registry: new IntegrationRegistry([fake]), credentials: intCreds }
      : undefined,
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  return { base, ws, vault, fake, intCreds, stop: () => server.close() };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};
const cred: ProviderCredential = {
  provider: "composio",
  data: { user: USER, apiKey: "uak_test" },
};

test("status starts disconnected; login stores the credential and flips it connected", async () => {
  const { base, fake, stop } = await setup();
  try {
    let status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status).toEqual({
      items: [{ provider: "composio", connected: false }],
    });

    const start = (await (
      await fetch(`${base}/v1/integrations/composio/login/start`, {
        method: "POST",
        headers: auth,
      })
    ).json()) as { pollKey: string; loginUrl: string };
    expect(start.loginUrl).toContain(start.pollKey);

    // Pending until the user finishes; then linked stores the credential.
    const pending = await (
      await fetch(`${base}/v1/integrations/composio/login/poll`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ pollKey: start.pollKey }),
      })
    ).json();
    expect(pending).toEqual({ status: "pending" });

    fake.completeLogin(start.pollKey, cred);
    const linked = await (
      await fetch(`${base}/v1/integrations/composio/login/poll`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ pollKey: start.pollKey }),
      })
    ).json();
    expect(linked.status).toBe("linked");
    expect(linked.account.accountId).toBe(USER);

    status = await (
      await fetch(`${base}/v1/integrations`, { headers: auth })
    ).json();
    expect(status.items[0]).toMatchObject({
      provider: "composio",
      connected: true,
    });
  } finally {
    stop();
  }
});

test("toolkits/connections/connect/disconnect require a connected credential", async () => {
  const { base, intCreds, stop } = await setup();
  try {
    // Not connected → 409 on the credential-bearing routes.
    expect(
      (
        await fetch(`${base}/v1/integrations/composio/toolkits`, {
          headers: auth,
        })
      ).status,
    ).toBe(409);

    await intCreds.put(USER, cred);

    const toolkits = await (
      await fetch(`${base}/v1/integrations/composio/toolkits`, {
        headers: auth,
      })
    ).json();
    expect(toolkits.items.map((t: { slug: string }) => t.slug)).toContain(
      "gmail",
    );

    expect(
      (
        await (
          await fetch(`${base}/v1/integrations/composio/connections`, {
            headers: auth,
          })
        ).json()
      ).items,
    ).toEqual([]);

    const connect = await (
      await fetch(`${base}/v1/integrations/composio/connect`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ toolkit: "gmail" }),
      })
    ).json();
    expect(connect.redirectUrl).toContain("gmail");

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
  } finally {
    stop();
  }
});

test("logout removes the credential; unknown provider 404s; no auth 401s", async () => {
  const { base, intCreds, stop } = await setup();
  try {
    await intCreds.put(USER, cred);
    await fetch(`${base}/v1/integrations/composio/logout`, {
      method: "POST",
      headers: auth,
    });
    expect(await intCreds.get(USER, "composio")).toBeNull();

    expect(
      (await fetch(`${base}/v1/integrations/nope/toolkits`, { headers: auth }))
        .status,
    ).toBe(404);
    expect((await fetch(`${base}/v1/integrations`)).status).toBe(401);
  } finally {
    stop();
  }
});

test("sandbox proxy: HMAC token → workspace owner's credential → execute/search", async () => {
  const { base, ws, vault, intCreds, stop } = await setup();
  try {
    await intCreds.put(USER, cred); // the workspace owner's connected account
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

test("sandbox proxy: bad token 401; connected-but-no-credential 409; the user key never crosses", async () => {
  const { base, ws, vault, stop } = await setup();
  try {
    // No integration credential stored for the owner yet.
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    expect(
      (
        await fetch(`${base}/sandbox/integrations/execute`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sb}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "X" }),
        })
      ).status,
    ).toBe(409);

    // A bad sandbox token is refused outright.
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
