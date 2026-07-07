import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { FakeIntegrationProvider } from "../integrations/fake";
import { MemoryIntegrationGrantStore } from "../integrations/grant-store";
import { LocalIntegrationGrants } from "../integrations/grants";
import { IntegrationRegistry } from "../integrations/registry";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The LOCAL per-agent integration-grants surface end-to-end over real HTTP.
 * Grants are now PER CONNECTED ACCOUNT (connectionId): materialize-on-first-read
 * defaults, replace-set validation against live connections, ownership, the
 * gateway-fronted profile NOT serving the routes, and the sandbox proxy's
 * search-filter / execute account-resolution once a record exists.
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

async function setupWith(
  fake: FakeIntegrationProvider,
  opts: { withGrants?: boolean } = {},
) {
  const withGrants = opts.withGrants ?? true;
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const registry = new IntegrationRegistry([fake]);
  const grantStore = new MemoryIntegrationGrantStore();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: { registry },
    integrationGrants: withGrants
      ? new LocalIntegrationGrants({ store: grantStore, registry })
      : undefined,
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  const agent = await store.createAgent({
    workspaceId: ws.id,
    name: "Assistant",
  });
  return {
    base,
    ws,
    agent,
    vault,
    fake,
    grantStore,
    stop: () => server.close(),
  };
}

const setup = (opts: { withGrants?: boolean } = {}) =>
  setupWith(new FakeIntegrationProvider({ id: "composio" }), opts);

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};
const grantsUrl = (base: string, agentId: string) =>
  `${base}/v1/agents/${encodeURIComponent(agentId)}/integration-grants`;

/** Connect a toolkit and complete its OAuth; optionally label it. Returns the id. */
async function connectActive(
  fake: FakeIntegrationProvider,
  toolkit: string,
  label?: string,
): Promise<string> {
  const { connectionId } = await fake.connect(USER, toolkit);
  fake.completeConnection(USER, connectionId);
  if (label) await fake.rename(USER, connectionId, label);
  return connectionId;
}

function sandbox(
  base: string,
  sb: string,
  kind: "search" | "execute",
  body: unknown,
) {
  return fetch(`${base}/sandbox/integrations/${kind}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sb}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("GET materializes the connected ACCOUNTS on first read and persists them", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    const g = await connectActive(fake, "gmail");
    const s = await connectActive(fake, "slack");
    // A second gmail account is a distinct grant unit.
    const g2 = await connectActive(fake, "gmail");
    await fake.connect(USER, "github"); // stays pending → excluded

    const res = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).accounts.sort()).toEqual([g, g2, s].sort());

    expect(await grantStore.get(agent.id)).toEqual({
      stored: true,
      accounts: [
        { connectionId: g, toolkit: "gmail" },
        { connectionId: s, toolkit: "slack" },
        { connectionId: g2, toolkit: "gmail" },
      ],
    });
  } finally {
    stop();
  }
});

test("provider not ready → GET returns [] WITHOUT persisting", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    await fake.connect(USER, "gmail");
    fake.setNotReady();
    const res = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).accounts).toEqual([]);
    expect(await grantStore.get(agent.id)).toEqual({ stored: false });
  } finally {
    stop();
  }
});

test("PUT validates ids against live connections, captures toolkit, dedupes", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    const g = await connectActive(fake, "gmail");
    const s = await connectActive(fake, "slack");
    const put = (accounts: unknown) =>
      fetch(grantsUrl(base, agent.id), {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ accounts }),
      });

    const ok = await put([g, g, s]);
    expect(ok.status).toBe(200);
    expect((await ok.json()).accounts).toEqual([g, s]);
    // Toolkit captured server-side, not trusted from the client.
    expect(await grantStore.get(agent.id)).toEqual({
      stored: true,
      accounts: [
        { connectionId: g, toolkit: "gmail" },
        { connectionId: s, toolkit: "slack" },
      ],
    });

    // A GET now returns the stored ids verbatim (no re-materialize).
    const get = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect((await get.json()).accounts).toEqual([g, s]);

    // An id that is not one of the user's connections → invalid_accounts.
    const bad = await put([g, "ghost"]);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_accounts");

    expect((await put("gmail")).status).toBe(400); // not an array
    expect((await put([1])).status).toBe(400); // not strings
  } finally {
    stop();
  }
});

test("GET heals a stored grant after one of its accounts is disconnected (no permanent invalid_accounts)", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    const a = await connectActive(fake, "gmail");
    const b = await connectActive(fake, "slack");
    // First GET materializes + persists both accounts as the default.
    const first = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect((await first.json()).accounts.sort()).toEqual([a, b].sort());

    // The user disconnects account b — it is no longer a live connection, but a
    // naive GET would still return it and every later replace-set PUT (which
    // validates each id against live connections) would 400 invalid_accounts.
    await fake.disconnect(USER, b);

    const healed = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect((await healed.json()).accounts).toEqual([a]);
    expect(await grantStore.get(agent.id)).toEqual({
      stored: true,
      accounts: [{ connectionId: a, toolkit: "gmail" }],
    });

    // A subsequent toggle PUTs the healed set (no stale id) → succeeds.
    const put = await fetch(grantsUrl(base, agent.id), {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ accounts: [a] }),
    });
    expect(put.status).toBe(200);
  } finally {
    stop();
  }
});

test("GET does NOT prune a stored grant when the provider is signed out", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    const a = await connectActive(fake, "gmail");
    const b = await connectActive(fake, "slack");
    await fetch(grantsUrl(base, agent.id), { headers: auth }); // materialize [a,b]
    // Signed out → we cannot trust the (empty/failing) connection list, so the
    // record must survive untouched rather than being wiped to nothing.
    fake.setNotReady();
    const res = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect((await res.json()).accounts.sort()).toEqual([a, b].sort());
    expect(await grantStore.get(agent.id)).toEqual({
      stored: true,
      accounts: [
        { connectionId: a, toolkit: "gmail" },
        { connectionId: b, toolkit: "slack" },
      ],
    });
  } finally {
    stop();
  }
});

test("unknown agent → 404", async () => {
  const { base, ws, stop } = await setup();
  try {
    const res = await fetch(grantsUrl(base, `${ws.id}/Ghost`), {
      headers: auth,
    });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});

test("gateway-fronted profile (no integrationGrants) does not serve the routes", async () => {
  const { base, agent, stop } = await setup({ withGrants: false });
  try {
    expect(
      (await fetch(grantsUrl(base, agent.id), { headers: auth })).status,
    ).toBe(404);
    expect(
      (
        await fetch(grantsUrl(base, agent.id), {
          method: "PUT",
          headers: auth,
          body: JSON.stringify({ accounts: [] }),
        })
      ).status,
    ).toBe(404);
  } finally {
    stop();
  }
});

test("sandbox search filters ungranted toolkits + attaches granted accounts with labels", async () => {
  const fake = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      { action: "GMAIL_SEND_EMAIL", toolkit: "gmail", description: "email" },
      { action: "SLACK_POST", toolkit: "slack", description: "email" },
      // Never connected → must SURVIVE the grant filter (HOU-670 discovery).
      { action: "NOTION_ADD", toolkit: "notion", description: "email notes" },
    ],
  });
  const { base, ws, agent, vault, grantStore, stop } = await setupWith(fake);
  try {
    const g = await connectActive(fake, "gmail", "Work");
    await connectActive(fake, "slack"); // connected but NOT granted
    await grantStore.put(agent.id, [{ connectionId: g, toolkit: "gmail" }]);

    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await sandbox(base, sb, "search", { query: "email" });
    const body = (await res.json()) as {
      items: { action: string }[];
      accounts: {
        connectionId: string;
        accountLabel?: string;
        toolkit: string;
      }[];
    };
    expect(body.items.map((m) => m.action)).toEqual([
      "GMAIL_SEND_EMAIL",
      "NOTION_ADD",
    ]);
    expect(body.accounts).toEqual([
      { toolkit: "gmail", connectionId: g, accountLabel: "Work" },
    ]);
  } finally {
    stop();
  }
});

test("sandbox execute: ungranted toolkit 403; single granted account auto-pins", async () => {
  const { base, ws, agent, vault, fake, grantStore, stop } = await setup();
  try {
    const g = await connectActive(fake, "gmail");
    await grantStore.put(agent.id, [{ connectionId: g, toolkit: "gmail" }]);
    const sb = vault.sandboxToken(ws.id, agent.id);

    const denied = await sandbox(base, sb, "execute", {
      action: "SLACK_POST_MESSAGE",
      params: {},
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("toolkit_not_granted");

    const allowed = await sandbox(base, sb, "execute", {
      action: "GMAIL_SEND_EMAIL",
      params: {},
    });
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).successful).toBe(true);
    expect(fake.lastAccount).toBe(g); // auto-pinned the sole granted account
  } finally {
    stop();
  }
});

test("sandbox execute: >1 granted account requires a choice, then resolves id or label", async () => {
  const { base, ws, agent, vault, fake, grantStore, stop } = await setup();
  try {
    const g1 = await connectActive(fake, "gmail", "Work");
    const g2 = await connectActive(fake, "gmail"); // unnamed
    await grantStore.put(agent.id, [
      { connectionId: g1, toolkit: "gmail" },
      { connectionId: g2, toolkit: "gmail" },
    ]);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const exec = (account?: string) =>
      sandbox(base, sb, "execute", {
        action: "GMAIL_SEND_EMAIL",
        params: {},
        ...(account ? { account } : {}),
      });

    // No account + ambiguity → 400 account_required listing both.
    const need = await exec();
    expect(need.status).toBe(400);
    const needBody = await need.json();
    expect(needBody.error).toBe("account_required");
    expect(
      needBody.accounts
        .map((a: { connectionId: string }) => a.connectionId)
        .sort(),
    ).toEqual([g1, g2].sort());

    // By exact id.
    expect((await exec(g2)).status).toBe(200);
    expect(fake.lastAccount).toBe(g2);
    // By label (case-insensitive).
    expect((await exec("work")).status).toBe(200);
    expect(fake.lastAccount).toBe(g1);
    // Unknown → account_not_granted.
    const bad = await exec("nope");
    expect(bad.status).toBe(403);
    expect((await bad.json()).error).toBe("account_not_granted");
  } finally {
    stop();
  }
});

test("no stored record → sandbox execute passes through, forwarding account verbatim", async () => {
  const { base, ws, agent, vault, fake, stop } = await setup();
  try {
    const sb = vault.sandboxToken(ws.id, agent.id);
    const exec = await sandbox(base, sb, "execute", {
      action: "SLACK_POST_MESSAGE",
      params: {},
      account: "whatever",
    });
    expect(exec.status).toBe(200); // no record → not filtered
    expect(fake.lastAccount).toBe("whatever"); // forwarded, no resolution
  } finally {
    stop();
  }
});

test("gateway-fronted (no grants dep) → sandbox forwards account verbatim, no resolution", async () => {
  const { base, ws, agent, vault, fake, stop } = await setup({
    withGrants: false,
  });
  try {
    const sb = vault.sandboxToken(ws.id, agent.id);
    const exec = await sandbox(base, sb, "execute", {
      action: "GMAIL_SEND_EMAIL",
      params: {},
      account: "upstream-resolves-this",
    });
    expect(exec.status).toBe(200);
    expect(fake.lastAccount).toBe("upstream-resolves-this");
  } finally {
    stop();
  }
});
