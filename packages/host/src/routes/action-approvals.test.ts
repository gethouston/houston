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
 * validation, the always-allow + ticket writes, and the unwired-dep 404.
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
