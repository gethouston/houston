import type { Agent, AgentId } from "../domain/types";
import type {
  RuntimeEndpoint,
  RuntimeLauncher,
  RuntimeState,
} from "../ports";

/**
 * In-memory RuntimeLauncher for dev and tests. No cluster: it tracks each agent's
 * state in a map and points every awake sandbox at one configurable engine URL
 * (a locally-running engine, or a fake). State transitions mirror the live impl:
 *   ensureAwake -> running, sleep -> asleep, destroy -> absent.
 */

export interface FakeLauncherOptions {
  /** Base URL handed back by ensureAwake. Defaults to env or 127.0.0.1:4317. */
  baseUrl?: string;
  /** Token handed back by ensureAwake. Defaults to a static dev token. */
  token?: string;
}

const DEFAULT_BASE_URL =
  process.env.HOUSTON_FAKE_ENGINE_URL || "http://127.0.0.1:4317";
const DEFAULT_TOKEN = "fake-sandbox-token";

export class FakeLauncher implements RuntimeLauncher {
  private readonly states = new Map<AgentId, RuntimeState>();
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(opts: FakeLauncherOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.token = opts.token ?? DEFAULT_TOKEN;
  }

  async ensureAwake(agent: Agent): Promise<RuntimeEndpoint> {
    this.states.set(agent.id, "running");
    return { baseUrl: this.baseUrl, token: this.token };
  }

  async sleep(agentId: AgentId): Promise<void> {
    // Sleeping something that was destroyed/never-created is a no-op-to-absent
    // mismatch we must not paper over: only an existing sandbox can sleep.
    const current = this.states.get(agentId) ?? "absent";
    if (current === "absent") {
      throw new Error(`cannot sleep sandbox for unknown agent ${agentId}`);
    }
    this.states.set(agentId, "asleep");
  }

  async destroy(agentId: AgentId, _opts?: { dropVolume?: boolean }): Promise<void> {
    this.states.set(agentId, "absent");
  }

  async status(agentId: AgentId): Promise<RuntimeState> {
    return this.states.get(agentId) ?? "absent";
  }
}
