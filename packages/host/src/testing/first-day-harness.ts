import type { Server } from "node:http";
import {
  AGENT_SETUP_AGENT_MODE,
  loadActivities,
  loadConfig,
  saveActivities,
} from "@houston/domain";
import type { Activity, AgentConfig, Capabilities } from "@houston/protocol";
import { MemoryCredentialStore } from "../credentials/store";
import type {
  ChannelCtx,
  RuntimeChannel,
  TokenVerifier,
  TurnPin,
} from "../ports";
import { workspaceRoot } from "../routes/agent-data";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * A control-plane host serving `POST /agents/:agentId/first-day` over memory
 * stores and a spy channel, for the first-day route's tests.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

export interface Fired {
  conversationId: string;
  text: string;
  pin?: TurnPin;
  actingUser?: string;
}

export class SpyChannel implements RuntimeChannel {
  fired: Fired[] = [];
  /** What every fire throws, after recording it; a string becomes an Error. */
  failWith: string | Error | null = null;
  /** Holds every fire until released, to overlap two starts deterministically. */
  gate: Promise<void> | null = null;
  async dispatch() {}
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    actingUser?: string,
  ): Promise<void> {
    if (this.gate) await this.gate;
    this.fired.push({ conversationId, text, pin, actingUser });
    if (this.failWith === null) return;
    throw typeof this.failWith === "string"
      ? new Error(this.failWith)
      : this.failWith;
  }
  async cancelTurn() {
    return false;
  }
  async busy() {
    return false;
  }
  async runtimeStatus() {
    return "running" as const;
  }
  async teardown() {}
  async captureCredential() {
    return { ok: true as const, provider: "openai-codex" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}

const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};

const HEADERS = {
  Authorization: "Bearer tok:alice",
  "Content-Type": "application/json",
};

const CONFIG_SEED = ".houston/config/config.json";
const BRIEF = "---\nindustry: Finance\nrole: Financial analyst\n---\n";

/** A new hire's config with its first day waiting, on a pinned brain. */
export const PENDING = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  firstDay: "pending",
  arrival: "created",
};

export interface FirstDayHost {
  vfs: MemoryVfs;
  channel: SpyChannel;
  /** Hire an employee the way every surface does: its config rides the create. */
  hire(config?: Record<string, unknown>): Promise<string>;
  start(agentId: string, body?: unknown): Promise<Response>;
  setupTasks(): Promise<Activity[]>;
  firstDay(): Promise<AgentConfig["firstDay"]>;
  /** A setup task left by a start that died before its first turn fired. */
  leaveUnfiredTask(): Promise<Activity>;
  close(): Promise<void>;
}

export async function bootFirstDayHost(): Promise<FirstDayHost> {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const channel = new SpyChannel();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs,
    capabilities: CAPS,
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const agentRoot = async (): Promise<string> => {
    const ws = await store.getOrCreatePersonalWorkspace("alice");
    const [agent] = await store.listAgents(ws.id);
    if (!agent) throw new Error("no agent");
    return workspaceRoot(ws, agent);
  };

  return {
    vfs,
    channel,
    async hire(config) {
      const res = await fetch(`${base}/agents`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          name: "Nova",
          claudeMd: BRIEF,
          ...(config
            ? { seeds: { [CONFIG_SEED]: JSON.stringify(config) } }
            : {}),
        }),
      });
      return ((await res.json()) as { id: string }).id;
    },
    start: (agentId, body = {}) =>
      fetch(`${base}/agents/${agentId}/first-day`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      }),
    async setupTasks() {
      const { items } = await loadActivities(vfs, await agentRoot());
      return items.filter((a) => a.agent === AGENT_SETUP_AGENT_MODE);
    },
    firstDay: async () =>
      (await loadConfig(vfs, await agentRoot())).config.firstDay,
    async leaveUnfiredTask() {
      const task: Activity = {
        id: "m-1",
        title: "Getting set up",
        description: "",
        status: "running",
        updated_at: "2026-01-01T00:00:00.000Z",
        agent: AGENT_SETUP_AGENT_MODE,
      };
      await saveActivities(vfs, await agentRoot(), [task]);
      return task;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
