import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID, SEED_WORKSPACE_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";
import { isGranted } from "./state";

/**
 * Covers the package's new lifecycle surface — `startFakeHost` / `FakeHost.stop`
 * — and a few representative routes, so the exported API is exercised outside
 * the Playwright suite. Each test binds an ephemeral port (0) to stay hermetic.
 */
describe("startFakeHost", () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = await startFakeHost(0);
  });

  afterEach(async () => {
    await host.stop();
  });

  it("binds an ephemeral port and reports its url", () => {
    expect(host.port).toBeGreaterThan(0);
    expect(host.url).toBe(`http://localhost:${host.port}`);
  });

  it("answers the health probe", async () => {
    const res = await fetch(`${host.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "e2e" });
  });

  it("serves the seeded agent and the local capabilities", async () => {
    const agents = (await (await fetch(`${host.url}/agents`)).json()) as Array<{
      id: string;
    }>;
    expect(agents.map((a) => a.id)).toContain(SEED_AGENT_ID);

    const caps = (await (
      await fetch(`${host.url}/v1/capabilities`)
    ).json()) as { profile: string; providers: string[] };
    expect(caps.profile).toBe("local");
    expect(caps.providers).toContain("anthropic");
  });

  it("serves the pi-ai provider catalog at /v1/catalog", async () => {
    // Regression: the route was missing, so the app's `getCatalog()` 404-degraded
    // to `[]` and the picker/AI-Models tab fell back to the override-only seed
    // (all providers, zero models). It must serve the real `ProviderCatalog` the
    // desktop host would — every runnable provider, each with its models.
    const res = await fetch(`${host.url}/v1/catalog`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as Array<{
      id: string;
      auth: string;
      models: Array<{ id: string }>;
    }>;
    // The local profile serves the full pi-ai set — many providers, real models.
    expect(catalog.length).toBeGreaterThan(20);
    const ids = catalog.map((p) => p.id);
    for (const id of ["anthropic", "openai-codex", "openrouter"])
      expect(ids).toContain(id);
    const totalModels = catalog.reduce((n, p) => n + p.models.length, 0);
    expect(totalModels).toBeGreaterThan(100);
  });

  it("serves the pre-agent connect surface at /setup-runtime/*", async () => {
    // Regression: the WebApp gate probes /setup-runtime/auth/status (the real
    // host serves no flat /auth/status — commit cfd61df0). The route was
    // missing here, so global-setup timed out waiting for "Your Agents".
    // The setup slot models FIRST-RUN: nothing connected yet — the gate is
    // reachability-only, and onboarding's connect step renders a Connect pill
    // per provider (onboarding-connect.spec asserts "Connect Anthropic").
    const status = await fetch(`${host.url}/setup-runtime/auth/status`);
    expect(status.status).toBe(200);
    const auth = (await status.json()) as {
      providers: Array<{ provider: string; configured: boolean }>;
      activeProvider: string | null;
    };
    expect(auth.activeProvider).toBeNull();
    expect(auth.providers.every((p) => !p.configured)).toBe(true);

    const providers = await fetch(`${host.url}/setup-runtime/providers`);
    expect(providers.status).toBe(200);
    const list = (await providers.json()) as Array<{
      id: string;
      configured: boolean;
    }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => !p.configured)).toBe(true);

    // The OAuth login chain flips the slot both reads share.
    const login = await fetch(
      `${host.url}/setup-runtime/auth/openai-codex/login`,
      { method: "POST" },
    );
    expect(login.status).toBe(200);
    const complete = await fetch(
      `${host.url}/setup-runtime/auth/openai-codex/login/complete`,
      { method: "POST" },
    );
    expect(complete.status).toBe(200);
    const after = (await (
      await fetch(`${host.url}/setup-runtime/auth/status`)
    ).json()) as {
      providers: Array<{ provider: string; configured: boolean }>;
    };
    expect(
      after.providers.find((p) => p.provider === "openai-codex")?.configured,
    ).toBe(true);
    const setupAfter = (await (
      await fetch(`${host.url}/setup-runtime/providers`)
    ).json()) as Array<{ id: string; configured: boolean }>;
    expect(setupAfter.find((p) => p.id === "openai-codex")?.configured).toBe(
      true,
    );

    // reset() empties the setup slot again (what onboarding specs rely on).
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const reseeded = (await (
      await fetch(`${host.url}/setup-runtime/auth/status`)
    ).json()) as { activeProvider: string | null };
    expect(reseeded.activeProvider).toBeNull();

    // The real host serves no flat /auth/status — neither does the fake.
    const flat = await fetch(`${host.url}/auth/status`);
    expect(flat.status).toBe(404);

    // Anything outside the connect surface stays agent-scoped — 404, like the
    // real host's allowlist (packages/host/src/routes/setup-runtime.ts).
    const outside = await fetch(`${host.url}/setup-runtime/settings`);
    expect(outside.status).toBe(404);
    const noExport = await fetch(`${host.url}/setup-runtime/auth/export`);
    expect(noExport.status).toBe(404);
  });

  it("exposes the __test__ reset control endpoint", async () => {
    const res = await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves + round-trips the per-workspace sidebar layout", async () => {
    const base = `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`;

    // Unset → the empty default (mirrors the real host's DEFAULT_SIDEBAR_LAYOUT).
    const initial = await fetch(base);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      groups: [],
      ungroupedOrder: [],
    });

    // A valid PUT persists and echoes the stored layout.
    const layout = {
      groups: [
        { id: "g1", name: "Work", collapsed: false, agentIds: ["a", "b"] },
      ],
      ungroupedOrder: ["c"],
    };
    const put = await fetch(base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(layout),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual(layout);
    expect(await (await fetch(base)).json()).toEqual(layout);
  });

  it("rejects a malformed sidebar layout with 400", async () => {
    const res = await fetch(
      `${host.url}/v1/workspaces/${SEED_WORKSPACE_ID}/sidebar-layout`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: "nope" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("404s a sidebar layout for an unknown workspace", async () => {
    const res = await fetch(`${host.url}/v1/workspaces/ghost/sidebar-layout`);
    expect(res.status).toBe(404);
  });

  it("round-trips the per-agent action-approval grant route", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const grants = `${host.url}/v1/agents/${SEED_AGENT_ID}/action-approvals/grants`;
    const snapshot = `${host.url}/__test__/action-approvals`;
    const jsonHeaders = { "content-type": "application/json" };

    // Unset → nothing granted.
    expect(await (await fetch(snapshot)).json()).toEqual({ grants: [] });

    // Confirming grants the slug and echoes ok.
    const allow = await fetch(grants, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ action: "GMAIL_SEND_DRAFT" }),
    });
    expect(allow.status).toBe(200);
    expect(await allow.json()).toEqual({ ok: true });
    // A re-grant dedupes case-insensitively; the snapshot reflects the stored list.
    await fetch(grants, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ action: "gmail_send_draft" }),
    });
    expect(await (await fetch(snapshot)).json()).toEqual({
      grants: ["GMAIL_SEND_DRAFT"],
    });

    // An invalid action slug is a clean 400, never a swallowed accept.
    const badAction = await fetch(grants, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ action: "bad slug!" }),
    });
    expect(badAction.status).toBe(400);

    // The grant is readable through the state helper.
    expect(isGranted(SEED_AGENT_ID, "gmail_send_draft")).toBe(true);
    expect(isGranted(SEED_AGENT_ID, "SLACK_POST")).toBe(false);
  });

  it("dismiss-interaction stops the transcript and clears the activity", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const agentBase = `${host.url}/agents/${SEED_AGENT_ID}`;
    const jsonHeaders = { "content-type": "application/json" };
    const approval = {
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          params: { to: "a@b.com" },
          paramsHash: "0123456789abcdef",
        },
      ],
    };

    // Bind a conversation to the seeded activity and persist the approval
    // interaction VERBATIM (covers the kind-agnostic PATCH set path).
    const patched = await fetch(`${agentBase}/activities/act-1`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        session_key: "conv-1",
        pending_interaction: approval,
      }),
    });
    const patchedBody = (await patched.json()) as {
      pending_interaction?: unknown;
    };
    expect(patchedBody.pending_interaction).toEqual(approval);

    // Dismiss: append the stop marker + retire the pending interaction.
    const dismissed = await fetch(
      `${agentBase}/conversations/conv-1/dismiss-interaction`,
      { method: "POST" },
    );
    expect(dismissed.status).toBe(200);
    expect(await dismissed.json()).toEqual({ ok: true });

    // The transcript ends on a stopped, empty assistant message.
    const messages = (await (
      await fetch(`${agentBase}/conversations/conv-1/messages`)
    ).json()) as { messages: Array<{ role: string; stopped?: boolean }> };
    const last = messages.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.stopped).toBe(true);

    // The board card no longer waits on the user (pending_interaction cleared).
    const activities = (await (
      await fetch(`${agentBase}/activities`)
    ).json()) as {
      items: Array<{ id: string; pending_interaction?: unknown }>;
    };
    const card = activities.items.find((a) => a.id === "act-1");
    expect(card?.pending_interaction).toBeUndefined();
  });

  it("deletes pending_interaction when an activity PATCH sends null", async () => {
    await fetch(`${host.url}/__test__/reset`, { method: "POST" });
    const url = `${host.url}/agents/${SEED_AGENT_ID}/activities/act-1`;
    const jsonHeaders = { "content-type": "application/json" };
    const approval = {
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "X",
          paramsHash: "0123456789abcdef",
        },
      ],
    };

    await fetch(url, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ pending_interaction: approval }),
    });
    // Explicit null clears it — the key is DELETED, not stored as null.
    const cleared = await fetch(url, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ pending_interaction: null }),
    });
    const activity = (await cleared.json()) as Record<string, unknown>;
    expect("pending_interaction" in activity).toBe(false);
  });

  it("stops cleanly so the port stops accepting connections", async () => {
    const { url } = host;
    await host.stop();
    // Re-start on the same ephemeral port for afterEach's stop() to close.
    host = await startFakeHost(0);
    await expect(fetch(url)).rejects.toThrow();
  });
});
