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
 * The user-facing action-approvals routes over real HTTP: ownership, body
 * validation, the always-allow + ticket writes, and the unwired-dep 404 —
 * on BOTH surfaces: the top-level `/v1/agents/:id/action-approvals/*` and the
 * per-agent dispatch `/agents/:id/action-approvals/*` (the one the hosted
 * gateway proxies to a pod, so the shipped clients call it).
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
  const approvalStore = new MemoryActionApprovalStore();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: new EnvCredentialVault({ secret: "test-secret" }),
    channels: {},
    capabilities: CAPS,
    actionApprovals: withApprovals
      ? new LocalActionApprovals({ store: approvalStore })
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
  return { base, ws, agent, approvalStore, stop: () => server.close() };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};
const url = (base: string, agentId: string, sub = "") =>
  `${base}/v1/agents/${encodeURIComponent(agentId)}/action-approvals${sub}`;
/** The dispatch-surface form of the same routes (what the shipped clients call). */
const dispatchUrl = (base: string, agentId: string, sub = "") =>
  `${base}/agents/${encodeURIComponent(agentId)}/action-approvals${sub}`;

test("GET returns the always list; POST /always appends (deduped)", async () => {
  const { base, agent, stop } = await setup();
  try {
    const empty = await fetch(url(base, agent.id), { headers: auth });
    expect(empty.status).toBe(200);
    expect((await empty.json()).always).toEqual([]);

    const post = (action: unknown) =>
      fetch(url(base, agent.id, "/always"), {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ action }),
      });
    expect((await (await post("GMAIL_SEND")).json()).always).toEqual([
      "GMAIL_SEND",
    ]);
    // Case-insensitive dedupe keeps the first casing.
    expect((await (await post("gmail_send")).json()).always).toEqual([
      "GMAIL_SEND",
    ]);
    const get = await fetch(url(base, agent.id), { headers: auth });
    expect((await get.json()).always).toEqual(["GMAIL_SEND"]);
  } finally {
    stop();
  }
});

test("POST /always validates the action slug", async () => {
  const { base, agent, stop } = await setup();
  try {
    const post = (body: unknown) =>
      fetch(url(base, agent.id, "/always"), {
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

test("POST /tickets writes a one-shot ticket; validates the hash", async () => {
  const { base, agent, approvalStore, stop } = await setup();
  try {
    const post = (body: unknown) =>
      fetch(url(base, agent.id, "/tickets"), {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
      });
    const ok = await post({ hash: "0123456789abcdef" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    const record = await approvalStore.get(agent.id);
    expect(record.tickets.map((t) => t.hash)).toEqual(["0123456789abcdef"]);

    expect((await post({})).status).toBe(400); // missing
    expect((await post({ hash: "SHORT" })).status).toBe(400); // charset/length
    expect((await post({ hash: "0123456789ABCDEF" })).status).toBe(400); // uppercase rejected
  } finally {
    stop();
  }
});

test("a foreign user cannot touch another user's agent (403)", async () => {
  const { base, agent, stop } = await setup();
  try {
    const res = await fetch(url(base, agent.id), {
      headers: { Authorization: "Bearer other" },
    });
    expect(res.status).toBe(403); // owns the workspace? no → "not your agent"
  } finally {
    stop();
  }
});

test("unknown agent → 404", async () => {
  const { base, ws, stop } = await setup();
  try {
    const res = await fetch(url(base, `${ws.id}/Ghost`), { headers: auth });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});

test("dispatch surface serves the same three routes (GET / always / tickets)", async () => {
  const { base, agent, approvalStore, stop } = await setup();
  try {
    const empty = await fetch(dispatchUrl(base, agent.id), { headers: auth });
    expect(empty.status).toBe(200);
    expect((await empty.json()).always).toEqual([]);

    const always = await fetch(dispatchUrl(base, agent.id, "/always"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(always.status).toBe(200);
    expect((await always.json()).always).toEqual(["GMAIL_SEND"]);

    const ticket = await fetch(dispatchUrl(base, agent.id, "/tickets"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ hash: "0123456789abcdef" }),
    });
    expect(ticket.status).toBe(200);
    expect((await ticket.json()).ok).toBe(true);
    const record = await approvalStore.get(agent.id);
    expect(record.tickets.map((t) => t.hash)).toEqual(["0123456789abcdef"]);

    // Both surfaces read the SAME store.
    const get = await fetch(url(base, agent.id), { headers: auth });
    expect((await get.json()).always).toEqual(["GMAIL_SEND"]);
  } finally {
    stop();
  }
});

test("dispatch surface validates bodies like the /v1 surface", async () => {
  const { base, agent, stop } = await setup();
  try {
    const always = await fetch(dispatchUrl(base, agent.id, "/always"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "bad slug!" }),
    });
    expect(always.status).toBe(400);
    const ticket = await fetch(dispatchUrl(base, agent.id, "/tickets"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ hash: "SHORT" }),
    });
    expect(ticket.status).toBe(400);
  } finally {
    stop();
  }
});

test("dispatch surface enforces the same ownership check (403)", async () => {
  const { base, agent, stop } = await setup();
  try {
    const res = await fetch(dispatchUrl(base, agent.id), {
      headers: { Authorization: "Bearer other" },
    });
    expect(res.status).toBe(403);
  } finally {
    stop();
  }
});

test("unwired dep → dispatch requests fall through past the approval routes", async () => {
  const { base, agent, stop } = await setup({ withApprovals: false });
  try {
    // With no approval store the family is not served here; the request keeps
    // falling toward the runtime channel (none wired in this harness → 503),
    // never a 200 pretending the write landed.
    const res = await fetch(dispatchUrl(base, agent.id, "/tickets"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ hash: "0123456789abcdef" }),
    });
    expect(res.status).toBe(503);
  } finally {
    stop();
  }
});

test("unwired dep → routes 404 (approvals unsupported)", async () => {
  const { base, agent, stop } = await setup({ withApprovals: false });
  try {
    expect((await fetch(url(base, agent.id), { headers: auth })).status).toBe(
      404,
    );
    const post = await fetch(url(base, agent.id, "/always"), {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action: "GMAIL_SEND" }),
    });
    expect(post.status).toBe(404);
  } finally {
    stop();
  }
});
