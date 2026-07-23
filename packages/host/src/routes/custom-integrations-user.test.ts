import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import {
  CustomIntegrationError,
  type CustomIntegrationView,
} from "../integrations/custom/types";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The custom-integration USER routes on their per-agent surfaces (HOU-823),
 * over the FULL server so the real mounting order and ownership checks run:
 * the `/v1/agents/:id/integrations/custom/*` wrapper and the per-agent
 * dispatch `/agents/:id/integrations/custom/*` — the ONE form the hosted
 * gateway proxies to a pod, so the shipped in-chat credential card calls it
 * in both deployments (the gateway's own /v1/integrations subtree is
 * Composio-only, and the top-level form 404s there).
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
  integrations: ["custom"],
};

const VIEW: CustomIntegrationView = {
  slug: "acme",
  name: "Acme",
  kind: "openapi",
  addedAtMs: 1,
  state: { status: "active", toolCount: 1 },
};

function fakeManager(
  overrides: Partial<
    Pick<CustomIntegrationManager, "list" | "setCredential" | "remove">
  > = {},
): CustomIntegrationManager {
  return {
    list: vi.fn(async () => [VIEW]),
    setCredential: vi.fn(async () => VIEW),
    remove: vi.fn(async () => {}),
    ...overrides,
  } as unknown as CustomIntegrationManager;
}

async function setup(manager: CustomIntegrationManager = fakeManager()) {
  const verifier: TokenVerifier = {
    async verify(b) {
      if (b === "tok") return { userId: USER };
      if (b === "other") return { userId: OTHER };
      return null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: new EnvCredentialVault({ secret: "test-secret" }),
    channels: {},
    capabilities: CAPS,
    customIntegrations: manager,
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
  return { base, agent, stop: () => server.close() };
}

const auth = (token = "tok") => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
const dispatchUrl = (base: string, agentId: string, sub = "") =>
  `${base}/agents/${encodeURIComponent(agentId)}/integrations/custom/definitions${sub}`;
const v1Url = (base: string, agentId: string, sub = "") =>
  `${base}/v1/agents/${encodeURIComponent(agentId)}/integrations/custom/definitions${sub}`;

test("dispatch surface: GET lists; POST credential validates and saves (the in-chat card's path)", async () => {
  const setCredential = vi.fn(async () => VIEW);
  const { base, agent, stop } = await setup(fakeManager({ setCredential }));
  try {
    const list = await fetch(dispatchUrl(base, agent.id), {
      headers: auth(),
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: [VIEW] });

    const bad = await fetch(dispatchUrl(base, agent.id, "/acme/credential"), {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ values: "nope" }),
    });
    expect(bad.status).toBe(400);
    expect(setCredential).not.toHaveBeenCalled();

    const ok = await fetch(dispatchUrl(base, agent.id, "/acme/credential"), {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ values: { token: "secret" } }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(VIEW);
    expect(setCredential).toHaveBeenCalledWith("acme", { token: "secret" });
  } finally {
    stop();
  }
});

test("dispatch surface relays manager errors as stable {error, code} bodies", async () => {
  const { base, agent, stop } = await setup(
    fakeManager({
      setCredential: vi.fn(async () => {
        throw new CustomIntegrationError(
          "credential_invalid",
          "the credential value is empty",
        );
      }),
    }),
  );
  try {
    const res = await fetch(dispatchUrl(base, agent.id, "/acme/credential"), {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ values: { token: "" } }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "the credential value is empty",
      code: "credential_invalid",
    });
  } finally {
    stop();
  }
});

test("/v1 agent-scoped form: owner passes; another user is refused; DELETE removes", async () => {
  const remove = vi.fn(async () => {});
  const { base, agent, stop } = await setup(fakeManager({ remove }));
  try {
    const list = await fetch(v1Url(base, agent.id), { headers: auth() });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: [VIEW] });

    const denied = await fetch(v1Url(base, agent.id), {
      headers: auth("other"),
    });
    expect([403, 404]).toContain(denied.status);

    const del = await fetch(v1Url(base, agent.id, "/acme"), {
      method: "DELETE",
      headers: auth(),
    });
    expect(del.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("acme");
  } finally {
    stop();
  }
});

test("top-level /v1 form still serves against the full server (regression)", async () => {
  const { base, stop } = await setup();
  try {
    const res = await fetch(`${base}/v1/integrations/custom/definitions`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [VIEW] });
  } finally {
    stop();
  }
});
