import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { MemoryActionApprovalStore } from "../integrations/action-approval-store";
import { LocalActionApprovals } from "../integrations/action-approvals";
import { FakeIntegrationProvider } from "../integrations/fake";
import { IntegrationRegistry } from "../integrations/registry";
import { IntegrationUpstreamError } from "../integrations/types";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { providerForAction } from "./integrations-sandbox";

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
    reconnectNotice?: {
      active(): boolean;
      dismiss(): void | Promise<void>;
    };
    session?: { set(token: string | null): void };
    withApprovals?: boolean;
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
  const approvals = opts.withApprovals
    ? new LocalActionApprovals({ store: new MemoryActionApprovalStore() })
    : undefined;
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
          ...(opts.reconnectNotice
            ? { reconnectNotice: opts.reconnectNotice }
            : {}),
          ...(opts.session ? { session: opts.session } : {}),
        }
      : undefined,
    ...(approvals ? { actionApprovals: approvals } : {}),
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  return { base, ws, store, vault, fake, stop: () => server.close() };
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

test("action-approval gate: a read-only action runs ungated (no ticket, no always record)", async () => {
  // Approvals wired but the store is empty — no always record, no ticket. A
  // read-only slug must still execute (precedence step 0), never 409.
  const { base, ws, vault, stop } = await setup({ withApprovals: true });
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_FETCH_EMAILS", params: {} }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("action-approval circle: confirming on the dispatch route lets the SAME action execute (any params)", async () => {
  // The full user flow: the card's confirm ("Do it") POSTs the dispatch surface
  // (what the shipped clients call), the model re-issues the action, and the
  // sandbox gate must pass on the stored grant — proving the route and the gate
  // address the SAME record for the SAME agent id. The grant is ACTION-scoped,
  // so a follow-up call of the same action with DIFFERENT params passes too (the
  // batch / chained draft→send case the old params-exact ticket re-asked on).
  const { base, ws, store, vault, stop } = await setup({ withApprovals: true });
  try {
    const agent = await store.createAgent({
      workspaceId: ws.id,
      name: "Assistant",
    });
    const post = await fetch(
      `${base}/agents/${encodeURIComponent(agent.id)}/action-approvals/grants`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ action: "GMAIL_SEND_EMAIL" }),
      },
    );
    expect(post.status).toBe(200);
    expect((await post.json()).ok).toBe(true);

    const sb = vault.sandboxToken(ws.id, agent.id);
    const execute = (params: Record<string, unknown>) =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params }),
      });

    const first = await execute({ to: "a@b.com" });
    expect(first.status).toBe(200);
    expect((await first.json()).successful).toBe(true);
    // DIFFERENT params — the action grant still covers it (no re-ask).
    const second = await execute({ to: "c@d.com", subject: "Hi" });
    expect(second.status).toBe(200);
    expect((await second.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("action-approval gate: a write action 409s approval_required without a grant", async () => {
  const { base, ws, vault, stop } = await setup({ withApprovals: true });
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("approval_required");
  } finally {
    stop();
  }
});

test("action-approval gate: a grant expires after the TTL (the gate 409s again)", async () => {
  // Fake only Date so the grant's ts and the gate's clock advance together while
  // the HTTP server + fetch keep real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  const { base, ws, store, vault, stop } = await setup({ withApprovals: true });
  try {
    const agent = await store.createAgent({
      workspaceId: ws.id,
      name: "Assistant",
    });
    await fetch(
      `${base}/agents/${encodeURIComponent(agent.id)}/action-approvals/grants`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ action: "GMAIL_SEND_EMAIL" }),
      },
    );
    const sb = vault.sandboxToken(ws.id, agent.id);
    const execute = () =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
      });

    // Within the window → runs.
    expect((await execute()).status).toBe(200);
    // Past the TTL → the grant is stale, the gate asks again.
    vi.setSystemTime(Date.now() + LocalActionApprovals.GRANT_TTL_MS + 1);
    const expired = await execute();
    expect(expired.status).toBe(409);
    expect((await expired.json()).code).toBe("approval_required");
  } finally {
    stop();
    vi.useRealTimers();
  }
});

test("action-approval gate: the agent's intent rides the 409 (trimmed, truncated, else omitted)", async () => {
  const { base, ws, vault, stop } = await setup({ withApprovals: true });
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const execute = (extra: Record<string, unknown>) =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "GMAIL_SEND_EMAIL",
          params: {},
          ...extra,
        }),
      });

    // A real intent is trimmed and echoed.
    const withIntent = await execute({ intent: "  Send the invite  " });
    expect((await withIntent.json()).approval.intent).toBe("Send the invite");
    // Over-long is truncated to 200 chars.
    const long = await execute({ intent: "x".repeat(500) });
    expect((await long.json()).approval.intent).toHaveLength(200);
    // Absent / blank → the field is omitted entirely.
    const none = await execute({});
    expect((await none.json()).approval).not.toHaveProperty("intent");
    const blank = await execute({ intent: "   " });
    expect((await blank.json()).approval).not.toHaveProperty("intent");
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

// ── Multi-provider fan-out (custom + Composio registered together) ─────────

/**
 * The custom-integrations feature registers a SECOND IntegrationProvider
 * ("custom") beside Composio. The sandbox proxy's search/execute must treat
 * "no explicit provider" as "every registered provider", merging search
 * results and routing execute by the action's own shape (see
 * `providerForAction` in integrations-sandbox.ts) — not just always Composio.
 */
async function setupMulti(providers: FakeIntegrationProvider[]) {
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const registry = new IntegrationRegistry(providers);
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: { registry },
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
  return { base, ws, agent, vault, stop: () => server.close() };
}

test("sandbox search with no explicit provider fans out to EVERY registered provider and merges", async () => {
  const custom = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "tools.acme.org.default.doThing",
        toolkit: "acme",
        description: "do the acme thing",
      },
    ],
  });
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "send an acme-branded email",
      },
    ],
  });
  const { base, ws, vault, stop } = await setupMulti([custom, composio]);
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "acme" }),
    });
    expect(res.status).toBe(200);
    const items = ((await res.json()).items as { action: string }[]).map(
      (m) => m.action,
    );
    expect(items.sort()).toEqual(
      ["GMAIL_SEND_EMAIL", "tools.acme.org.default.doThing"].sort(),
    );
  } finally {
    stop();
  }
});

test("one provider rejecting must not hide another provider's search results", async () => {
  const custom = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "tools.acme.org.default.doThing",
        toolkit: "acme",
        description: "do the acme thing",
      },
    ],
  });
  const composio = new FakeIntegrationProvider({ id: "composio" });
  composio.throwSearchExecute = new Error("upstream boom");
  const { base, ws, vault, stop } = await setupMulti([custom, composio]);
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "acme" }),
    });
    expect(res.status).toBe(200);
    const items = (await res.json()).items as { action: string }[];
    expect(items.map((m) => m.action)).toEqual([
      "tools.acme.org.default.doThing",
    ]);
  } finally {
    stop();
  }
});

test("an ALL-empty merge still surfaces a signin_required underneath it (409), not an empty success", async () => {
  const custom = new FakeIntegrationProvider({ id: "custom" }); // default gmail action won't match
  const composio = new FakeIntegrationProvider({ id: "composio" });
  composio.throwSigninRequired = true;
  const { base, ws, vault, stop } = await setupMulti([custom, composio]);
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "no-such-app-anywhere" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("signin_required");
  } finally {
    stop();
  }
});

test("execute: an executor action (tools.*) routes to the 'custom' provider when registered", async () => {
  const custom = new FakeIntegrationProvider({ id: "custom" });
  const composio = new FakeIntegrationProvider({ id: "composio" });
  composio.throwSearchExecute = new Error(
    "composio must not be called for a tools.* action",
  );
  const { base, ws, vault, stop } = await setupMulti([custom, composio]);
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "tools.acme.org.default.doThing",
        params: {},
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("execute: a Composio-style action routes to the first non-custom provider", async () => {
  const custom = new FakeIntegrationProvider({ id: "custom" });
  custom.throwSearchExecute = new Error(
    "custom must not be called for a Composio-style action",
  );
  const composio = new FakeIntegrationProvider({ id: "composio" });
  const { base, ws, vault, stop } = await setupMulti([custom, composio]);
  try {
    const sb = vault.sandboxToken(ws.id, `${ws.id}/Assistant`);
    const res = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_SEND_EMAIL", params: {} }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("providerForAction: tools.* goes to 'custom' when registered, else the first non-custom, else whatever exists", () => {
  const withCustom = new IntegrationRegistry([
    new FakeIntegrationProvider({ id: "custom" }),
    new FakeIntegrationProvider({ id: "composio" }),
  ]);
  expect(providerForAction(withCustom, "tools.acme.org.default.doThing")).toBe(
    "custom",
  );
  expect(providerForAction(withCustom, "GMAIL_SEND_EMAIL")).toBe("composio");

  // No "custom" provider registered at all: a tools.* action still resolves to
  // whatever non-custom provider IS registered rather than throwing.
  const noCustom = new IntegrationRegistry([
    new FakeIntegrationProvider({ id: "composio" }),
  ]);
  expect(providerForAction(noCustom, "tools.acme.org.default.doThing")).toBe(
    "composio",
  );

  // "custom" is the only provider registered: even a Composio-shaped action
  // falls back to it (there is nothing else to route to).
  const onlyCustom = new IntegrationRegistry([
    new FakeIntegrationProvider({ id: "custom" }),
  ]);
  expect(providerForAction(onlyCustom, "GMAIL_SEND_EMAIL")).toBe("custom");
});

test("merged multi-provider search is NOT filtered per agent (grants removed)", async () => {
  const custom = new FakeIntegrationProvider({
    id: "custom",
    actions: [
      {
        action: "tools.acme.org.default.doThing",
        toolkit: "acme",
        description: "acme email helper",
      },
    ],
  });
  const composio = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "send an email",
      },
    ],
  });
  const { base, ws, agent, vault, stop } = await setupMulti([custom, composio]);
  try {
    for (const [provider, toolkit] of [
      [custom, "acme"],
      [composio, "gmail"],
    ] as const) {
      const { connectionId } = await provider.connect(USER, toolkit);
      provider.completeConnection(USER, connectionId);
    }

    const sb = vault.sandboxToken(ws.id, agent.id);
    // Usability is connection ∩ allowlist (enforced by the cloud gateway, not
    // this host) — the pod no longer filters search by any per-agent record, so
    // BOTH connected toolkits' actions surface.
    const searchRes = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "email" }),
    });
    const items = (await searchRes.json()).items as { action: string }[];
    expect(items.map((m) => m.action).sort()).toEqual([
      "GMAIL_SEND_EMAIL",
      "tools.acme.org.default.doThing",
    ]);

    // ...and execute of a toolkit that the old grant record would have excluded
    // is NOT 403'd — the pod runs it (no local grant gate anymore).
    const execRes = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "tools.acme.org.default.doThing",
        params: {},
      }),
    });
    expect(execRes.status).toBe(200);
  } finally {
    stop();
  }
});
