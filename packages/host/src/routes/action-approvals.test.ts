import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { MemoryActionApprovalStore } from "../integrations/action-approval-store";
import { LocalActionApprovals } from "../integrations/action-approvals";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The user-facing action-approvals route over real HTTP: ownership, body
 * validation, the grant write, and the unwired-dep 404 — on BOTH surfaces: the
 * top-level `/v1/agents/:id/action-approvals/grants` and the per-agent dispatch
 * `/agents/:id/action-approvals/grants` (the one the hosted gateway proxies to a
 * pod, so the shipped clients call it).
 */

const USER = "alice";
const OTHER = "mallory";
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

async function setup(opts: { withApprovals?: boolean } = {}) {
  const withApprovals = opts.withApprovals ?? true;
  const verifier: TokenVerifier = {
    async verify(b) {
      if (b === "tok") return { userId: USER };
      if (b === "other") return { userId: OTHER };
      return null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const approvals = new LocalActionApprovals({
    store: new MemoryActionApprovalStore(),
  });
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: new EnvCredentialVault({ secret: "test-secret" }),
    channels: {},
    capabilities: CAPS,
    actionApprovals: withApprovals ? approvals : undefined,
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
  return { base, ws, agent, approvals, stop: () => server.close() };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};
const url = (base: string, agentId: string) =>
  `${base}/v1/agents/${encodeURIComponent(agentId)}/action-approvals/grants`;
/** The dispatch-surface form of the same route (what the shipped clients call). */
const dispatchUrl = (base: string, agentId: string) =>
  `${base}/agents/${encodeURIComponent(agentId)}/action-approvals/grants`;

test("POST /grants grants the action (readable back through isGranted)", async () => {
  const { base, agent, approvals, stop } = await setup();
  try {
    const res = await fetch(url(base, agent.id), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await approvals.isGranted(agent.id, "gmail_send")).toBe(true);
  } finally {
    stop();
  }
});

test("POST /grants validates the action slug", async () => {
  const { base, agent, stop } = await setup();
  try {
    const post = (body: unknown) =>
      fetch(url(base, agent.id), {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
      });
    expect((await post({})).status).toBe(400); // missing
    expect((await post({ action: "" })).status).toBe(400); // empty
    expect((await post({ action: 42 })).status).toBe(400); // non-string
    expect((await post({ action: "bad slug!" })).status).toBe(400); // charset
  } finally {
    stop();
  }
});

test("a foreign user cannot grant on another user's agent (403)", async () => {
  const { base, agent, stop } = await setup();
  try {
    const res = await fetch(url(base, agent.id), {
      method: "POST",
      headers: {
        Authorization: "Bearer other",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(403);
  } finally {
    stop();
  }
});

test("unknown agent → 404", async () => {
  const { base, ws, stop } = await setup();
  try {
    const res = await fetch(url(base, `${ws.id}/Ghost`), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});

test("dispatch surface serves the SAME grant route into the SAME store", async () => {
  const { base, agent, approvals, stop } = await setup();
  try {
    const res = await fetch(dispatchUrl(base, agent.id), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await approvals.isGranted(agent.id, "GMAIL_SEND")).toBe(true);
  } finally {
    stop();
  }
});

test("dispatch surface validates the body like the /v1 surface", async () => {
  const { base, agent, stop } = await setup();
  try {
    const res = await fetch(dispatchUrl(base, agent.id), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "bad slug!" }),
    });
    expect(res.status).toBe(400);
  } finally {
    stop();
  }
});

test("dispatch surface enforces the same ownership check (403)", async () => {
  const { base, agent, stop } = await setup();
  try {
    const res = await fetch(dispatchUrl(base, agent.id), {
      method: "POST",
      headers: {
        Authorization: "Bearer other",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(403);
  } finally {
    stop();
  }
});

test("unwired dep → dispatch grant falls through past the approval route (503)", async () => {
  const { base, agent, stop } = await setup({ withApprovals: false });
  try {
    // No approval store → the family is not served here; the request keeps
    // falling toward the runtime channel (none wired → 503), never a 200.
    const res = await fetch(dispatchUrl(base, agent.id), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(503);
  } finally {
    stop();
  }
});

test("unwired dep → /v1 grant 404s (approvals unsupported)", async () => {
  const { base, agent, stop } = await setup({ withApprovals: false });
  try {
    const res = await fetch(url(base, agent.id), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});
