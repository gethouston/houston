import { HoustonEngineClient } from "@houston/engine-client";
import type {
  Activity,
  ActivityUpdate,
  Agent,
  ChatHistoryEntry,
  ConversationEntry,
  CreateAgent,
  CreateAgentResult,
  NewActivity,
  ProjectConfig,
  ProviderStatus,
  SessionStartRequest,
  SessionStartResponse,
  UpdateAgent,
  Workspace,
} from "../../../../ui/engine-client/src/types";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_AGENT_PATH,
  DEFAULT_WORKSPACE_ID,
  syntheticWorkspace,
  toNewProvider,
  toOldProvider,
} from "./synthetic";
import * as agents from "./agents";
import * as activities from "./activities";
import { readAgentFile as readAgentFileStore, writeAgentFile as writeAgentFileStore } from "./agent-files";
import { streamTurn, historyToFeed } from "./translate";
import { emitEvent } from "./bus";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
}

export class HoustonEngineError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`engine error ${status}`);
    this.name = "HoustonEngineError";
  }
  get code(): string | undefined {
    return (this.body as { error?: { code?: string } })?.error?.code;
  }
  get kind(): string | undefined {
    return (this.body as { error?: { kind?: string } })?.error?.kind;
  }
}
export function isHoustonEngineError(e: unknown): e is HoustonEngineError {
  return e instanceof HoustonEngineError;
}

/**
 * Drop-in replacement for `@houston-ai/engine-client`'s HoustonClient, backed by
 * the new TS engine. Boot/chat/auth map to the new engine; a single synthetic
 * workspace holds localStorage-backed agents, their `.houston/**` files, and
 * their boards; unsupported domains are stubbed (empty) by the Proxy fallback so
 * navigation never hits an undefined method.
 */
export class HoustonClient {
  private engine: HoustonEngineClient;
  /** Per-provider auth-status pollers that translate login completion into events. */
  private loginWatchers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(opts: HoustonClientOptions) {
    this.engine = new HoustonEngineClient({
      baseUrl: opts.baseUrl,
      token: opts.token || undefined,
    });
    return new Proxy(this, {
      get(target, prop, recv) {
        if (prop in target || typeof prop === "symbol") return Reflect.get(target, prop, recv);
        return async () => {
          console.warn(`[engine-adapter] unsupported HoustonClient.${String(prop)}() → []`);
          return [];
        };
      },
    });
  }

  private async activeOld(): Promise<{ provider: string; model: string }> {
    try {
      const providers = await this.engine.listProviders();
      const active = providers.find((p) => p.isActive) ?? providers.find((p) => p.configured);
      if (active) return { provider: toOldProvider(active.id), model: active.activeModel };
    } catch {
      /* engine unreachable / not authed */
    }
    return { provider: "anthropic", model: "claude-sonnet-4-6" };
  }

  // ---- meta / boot ----
  async health() {
    const h = await this.engine.health();
    return { status: h.status, version: h.version, protocol: 1 } as never;
  }
  async version() {
    return (await this.engine.version()) as never;
  }
  async listWorkspaces(): Promise<Workspace[]> {
    const { provider, model } = await this.activeOld();
    console.info("[engine-adapter] listWorkspaces -> 1 synthetic workspace");
    return [syntheticWorkspace(provider, model)];
  }
  async listAgents(workspaceId: string): Promise<Agent[]> {
    return agents.listAgents(workspaceId);
  }
  async createWorkspace(req: { name?: string }): Promise<Workspace> {
    const { provider, model } = await this.activeOld();
    return { ...syntheticWorkspace(provider, model), name: req?.name || "Houston" };
  }
  async renameWorkspace(): Promise<Workspace> {
    const { provider, model } = await this.activeOld();
    return syntheticWorkspace(provider, model);
  }
  async deleteWorkspace(): Promise<void> {}
  async setWorkspaceLocale(_id: string, locale: string | null): Promise<Workspace> {
    const { provider, model } = await this.activeOld();
    return { ...syntheticWorkspace(provider, model), locale };
  }
  async setWorkspaceProvider(): Promise<Workspace> {
    const { provider, model } = await this.activeOld();
    return syntheticWorkspace(provider, model);
  }
  async getWorkspaceContext() {
    return { workspaceMd: "", userMd: "" };
  }
  async setWorkspaceContext(_id: string, body: unknown) {
    return body;
  }
  async createAgent(workspaceId: string, req: CreateAgent): Promise<CreateAgentResult> {
    return agents.createAgent(workspaceId, req);
  }
  async renameAgent(workspaceId: string, agentId: string, newName: string): Promise<Agent> {
    return agents.renameAgent(workspaceId, agentId, newName);
  }
  async updateAgent(workspaceId: string, agentId: string, req: UpdateAgent): Promise<Agent> {
    return agents.updateAgentColor(workspaceId, agentId, req.color);
  }
  async deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    agents.deleteAgent(workspaceId, agentId);
  }
  async generateAgentInstructions() {
    return { instructions: "" };
  }
  async getPreference(key: string): Promise<string | null> {
    try {
      const stored = localStorage.getItem(`houston.pref.${key}`);
      if (stored !== null) return stored;
    } catch {
      /* storage disabled */
    }
    // Default to the synthetic ids so the shell auto-selects the workspace +
    // agent on first load (otherwise no agent is current and the board is empty).
    if (key === "last_workspace_id") return DEFAULT_WORKSPACE_ID;
    if (key === "last_agent_id") return DEFAULT_AGENT_ID;
    return null;
  }
  async setPreference(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(`houston.pref.${key}`, value);
    } catch {
      /* storage disabled */
    }
  }
  async getAgentConfig(): Promise<ProjectConfig> {
    const { provider, model } = await this.activeOld();
    return { name: "Houston", provider, model, effort: "medium" };
  }
  async setAgentConfig(_agentPath: string, config: ProjectConfig): Promise<ProjectConfig> {
    if (config.provider) {
      const pid = toNewProvider(config.provider);
      if (pid) await this.engine.setSettings({ activeProvider: pid, model: config.model });
    }
    return config;
  }
  async listInstalledConfigs() {
    return [];
  }

  // ---- activities (board / missions), backed locally ----
  async listActivities(agentPath: string): Promise<Activity[]> {
    return activities.listActivities(agentPath);
  }
  async createActivity(agentPath: string, input: NewActivity): Promise<Activity> {
    return activities.createActivity(agentPath, input);
  }
  async updateActivity(agentPath: string, id: string, updates: ActivityUpdate): Promise<Activity> {
    return activities.updateActivity(agentPath, id, updates);
  }
  async deleteActivity(agentPath: string, id: string): Promise<void> {
    activities.deleteActivity(agentPath, id);
  }

  // ---- agent data files (.houston/**), backed by localStorage ----
  async readAgentFile(agentPath: string, relPath: string): Promise<string> {
    return readAgentFileStore(agentPath, relPath);
  }
  async writeAgentFile(agentPath: string, relPath: string, content: string): Promise<void> {
    writeAgentFileStore(agentPath, relPath, content);
  }
  async seedAgentSchemas(): Promise<void> {}
  async migrateAgentFiles(): Promise<void> {}

  // ---- conversations / routines / skills (mostly empty) ----
  async listConversations(agentPath: string): Promise<ConversationEntry[]> {
    const agentName = agents.agentNameByPath(agentPath) ?? "Houston";
    return activities.listActivities(agentPath).map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      status: a.status,
      type: "activity",
      session_key: a.session_key ?? `activity-${a.id}`,
      updated_at: a.updated_at,
      agent_path: agentPath,
      agent_name: agentName,
    }));
  }
  async listAllConversations(agentPaths: string[]): Promise<ConversationEntry[]> {
    const all = await Promise.all(agentPaths.map((p) => this.listConversations(p)));
    return all.flat();
  }
  async listRoutines() {
    return [];
  }
  async listRoutineRuns() {
    return [];
  }
  async listSkills() {
    return [];
  }

  // ---- providers (auth) ----
  async providerStatus(name: string): Promise<ProviderStatus> {
    const pid = toNewProvider(name);
    let configured = false;
    if (pid) {
      try {
        const s = await this.engine.authStatus();
        configured = s.providers.find((p) => p.provider === pid)?.configured ?? false;
      } catch {
        /* unreachable */
      }
    }
    return {
      provider: name,
      cliInstalled: true,
      authState: configured ? "authenticated" : "unauthenticated",
      cliName: name,
      installSource: "managed",
      cliPath: null,
    } as ProviderStatus;
  }
  // deviceAuth is ignored: the engine picks the flow itself (Codex → device code,
  // Claude → loopback or copy-paste per the engine's headless mode).
  async providerLogin(name: string, _opts?: { deviceAuth?: boolean }): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) throw new Error(`provider ${name} not supported`);
    const info = await this.engine.startLogin(pid);

    // Drive the legacy login dialog. `device_code` carries the code to display;
    // `url` (loopback) and `auth_code` (headless Claude) leave `user_code` null
    // so the dialog shows a paste field — which the headless code is pasted into
    // (and which doubles as a fallback for loopback). The new engine emits no
    // completion event, so we poll auth status and synthesize one.
    const url = info.kind === "device_code" ? info.verificationUri : info.url;
    const userCode = info.kind === "device_code" ? info.userCode : null;
    emitEvent("ProviderLoginUrl", { provider: name, url, user_code: userCode });
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    this.watchLoginCompletion(pid, name);
  }
  async submitProviderLoginCode(name: string, code: string): Promise<void> {
    const pid = toNewProvider(name);
    if (pid) await this.engine.completeLogin(pid, code);
  }
  async cancelProviderLogin(name: string): Promise<void> {
    if (!toNewProvider(name)) return;
    this.stopLoginWatch(name);
    // Benign completion: clears the dialog + spinner without an error toast,
    // matching the old engine's cancel semantics.
    emitEvent("ProviderLoginComplete", { provider: name, success: false, error: null });
  }

  /**
   * Poll auth status until the in-flight login for `pid` resolves, then emit
   * `ProviderLoginComplete` so the legacy dialog closes and the card flips.
   * Covers all three flows: loopback auto-catch, pasted headless code, and
   * device-code polling.
   */
  private watchLoginCompletion(pid: "anthropic" | "openai-codex", name: string): void {
    this.stopLoginWatch(name);
    const startedAt = Date.now();
    const finish = (success: boolean, error: string | null) => {
      this.stopLoginWatch(name);
      emitEvent("ProviderLoginComplete", { provider: name, success, error });
    };
    const timer = setInterval(() => {
      void (async () => {
        try {
          const status = await this.engine.authStatus();
          const pr = status.providers.find((p) => p.provider === pid);
          if (pr?.configured) finish(true, null);
          else if (pr?.login?.status === "error") finish(false, pr?.login?.error ?? "Login failed");
          else if (Date.now() - startedAt > 10 * 60 * 1000) finish(false, "Login timed out");
        } catch {
          /* engine briefly unreachable; keep polling */
        }
      })();
    }, 1500);
    this.loginWatchers.set(name, timer);
  }

  private stopLoginWatch(name: string): void {
    const timer = this.loginWatchers.get(name);
    if (timer !== undefined) {
      clearInterval(timer);
      this.loginWatchers.delete(name);
    }
  }
  async providerLogout(name: string): Promise<void> {
    const pid = toNewProvider(name);
    if (pid) await this.engine.logout(pid);
  }
  async setGeminiApiKey(): Promise<void> {
    throw new Error("Gemini is not supported by this engine");
  }

  // ---- sessions / chat ----
  async startSession(agentPath: string, req: SessionStartRequest): Promise<SessionStartResponse> {
    // Fire-and-stream: events flow to the feed store over the bus/WS adapter.
    void streamTurn(this.engine, agentPath || DEFAULT_AGENT_PATH, req.sessionKey, req.prompt);
    return { sessionKey: req.sessionKey };
  }
  async cancelSession(_agentPath: string, sessionKey: string) {
    try {
      await this.engine.cancel(sessionKey);
    } catch {
      /* already done */
    }
    return { cancelled: true };
  }
  async startOnboarding(_agentPath: string, sessionKey: string): Promise<SessionStartResponse> {
    return { sessionKey };
  }
  async loadChatHistory(_agentPath: string, sessionKey: string): Promise<ChatHistoryEntry[]> {
    try {
      const history = await this.engine.getHistory(sessionKey);
      return historyToFeed(history.messages);
    } catch {
      return [];
    }
  }
  async summarizeActivity(message: string) {
    const title = message.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    return { title, description: "" };
  }

  // ---- lifecycle no-ops the shell calls ----
  async startAgentWatcher(): Promise<void> {}
  async stopAgentWatcher(): Promise<void> {}
  async startRoutineScheduler(): Promise<void> {}
  async stopRoutineScheduler(): Promise<void> {}
  async syncRoutineScheduler(): Promise<void> {}
  async claudeStatus() {
    return { installed: true, install_path: null, pinned_version: null, installed_version: null };
  }
  async composioStatus() {
    return { cliInstalled: false, authenticated: false, connections: [] };
  }

  wsUrl(): string {
    return "";
  }

  /** @internal — exposed so the WS adapter can identify the default agent. */
  defaultAgentId(): string {
    return DEFAULT_AGENT_ID;
  }
}
