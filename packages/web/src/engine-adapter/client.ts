import { HoustonEngineClient, type ProviderId } from "@houston/runtime-client";
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
  ProjectFile,
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
import * as controlPlane from "./control-plane";
import type { ControlPlaneConfig } from "./control-plane";
import { bus, emitEvent } from "./bus";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
  /** When true, route agents + chat through the Houston control plane (cloud). */
  controlPlane?: boolean;
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
  /** Non-null in cloud mode: agents + chat go through the control plane. */
  private cp: ControlPlaneConfig | null;
  /** In-flight cloud device-code logins, keyed `${agentId}:${providerId}` — the poll guard. */
  private activeLogins = new Set<string>();
  /** Per-provider auth-status pollers that translate login completion into events (local mode). */
  private loginWatchers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(opts: HoustonClientOptions) {
    const useCp =
      opts.controlPlane ?? (typeof window !== "undefined" && !!window.__HOUSTON_CP__);
    this.cp = useCp ? { baseUrl: opts.baseUrl.replace(/\/+$/, ""), token: opts.token } : null;
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

  /**
   * Cloud mode: open the host's global reactivity stream (`/v1/events`, SSE) and
   * fan it onto the in-process bus the UI already listens on — so an activity,
   * routine, or skill changing server-side invalidates the right query. Tied to
   * the EngineWebSocket connect/disconnect lifecycle (returns the unsubscribe).
   * Standalone web mode has no host stream, so this is a no-op.
   */
  subscribeServerEvents(): () => void {
    if (!this.cp) return () => {};
    return controlPlane.subscribeEvents(this.cp, (e) => bus.emit(e));
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

  /** The CP agent the user has selected (persisted as last_agent_id), or null. */
  private currentAgentId(): string | null {
    try {
      const id = localStorage.getItem("houston.pref.last_agent_id");
      return id && id !== DEFAULT_AGENT_ID ? id : null;
    } catch {
      return null;
    }
  }
  /** The selected agent id, or a user-facing error if none is open. */
  private requireAgentId(): string {
    const id = this.currentAgentId();
    if (!id) throw new Error("Open an agent first, then connect its account.");
    return id;
  }
  /** Runtime client for provider/auth calls: the selected agent's sandbox in cloud
   *  (null until an agent is selected), the single runtime locally. */
  private providerEngine(): HoustonEngineClient | null {
    if (!this.cp) return this.engine;
    const id = this.currentAgentId();
    return id ? controlPlane.runtimeClientFor(this.cp, id) : null;
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
    if (this.cp) return controlPlane.listAgents(this.cp);
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
    if (this.cp) return { agent: await controlPlane.createAgent(this.cp, req.name, req.color) };
    return agents.createAgent(workspaceId, req);
  }
  async renameAgent(workspaceId: string, agentId: string, newName: string): Promise<Agent> {
    if (this.cp) return controlPlane.renameAgent(this.cp, agentId, newName);
    return agents.renameAgent(workspaceId, agentId, newName);
  }
  async updateAgent(workspaceId: string, agentId: string, req: UpdateAgent): Promise<Agent> {
    if (this.cp) return controlPlane.updateAgentColor(this.cp, agentId, req.color);
    return agents.updateAgentColor(workspaceId, agentId, req.color);
  }
  async deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    if (this.cp) return controlPlane.deleteAgent(this.cp, agentId);
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

  // ---- activities (board / missions) ----
  // Cloud: the host serves them off the agent's workspace (.houston/activity).
  // Standalone web: localStorage-backed (no host).
  async listActivities(agentPath: string): Promise<Activity[]> {
    if (this.cp) return controlPlane.listActivities(this.cp, agentPath);
    return activities.listActivities(agentPath);
  }
  async createActivity(agentPath: string, input: NewActivity): Promise<Activity> {
    if (this.cp) return controlPlane.createActivity(this.cp, agentPath, input);
    return activities.createActivity(agentPath, input);
  }
  async updateActivity(agentPath: string, id: string, updates: ActivityUpdate): Promise<Activity> {
    if (this.cp) return controlPlane.updateActivity(this.cp, agentPath, id, updates);
    return activities.updateActivity(agentPath, id, updates);
  }
  async deleteActivity(agentPath: string, id: string): Promise<void> {
    if (this.cp) return controlPlane.deleteActivity(this.cp, agentPath, id);
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

  // ---- project files (the agent's REAL workspace) ----
  // In cloud mode the workspace is a GCS prefix served by the control plane at
  // /agents/:id/files*. agentPath IS the agentId here (folderPath = agent.id).
  // In synthetic/local web mode there is no real workspace, so these are inert.
  private async cpFilesFetch(agentId: string, path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.cp!.baseUrl}/agents/${encodeURIComponent(agentId)}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${controlPlane.liveToken(this.cp!.token)}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) throw new HoustonEngineError(res.status, await res.json().catch(() => ({})));
    return res;
  }
  async listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
    if (!this.cp) return [];
    return (await (await this.cpFilesFetch(agentPath, "files")).json()) as ProjectFile[];
  }
  async readProjectFile(agentPath: string, relPath: string): Promise<string> {
    if (!this.cp) return "";
    const res = await this.cpFilesFetch(agentPath, `files/read?path=${encodeURIComponent(relPath)}`);
    const body = (await res.json()) as { content: string; base64: boolean };
    return body.base64 ? atob(body.content) : body.content;
  }
  /** Raw bytes of a workspace file (binary-safe) plus its served MIME type. */
  async downloadProjectFile(
    agentPath: string,
    relPath: string,
  ): Promise<{ blob: Blob; contentType: string }> {
    if (!this.cp) throw new Error("downloads need a cloud workspace");
    const res = await this.cpFilesFetch(
      agentPath,
      `files/download?path=${encodeURIComponent(relPath)}`,
    );
    return {
      blob: await res.blob(),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  async deleteFile(agentPath: string, relPath: string): Promise<void> {
    if (!this.cp) return;
    await this.cpFilesFetch(agentPath, `files?path=${encodeURIComponent(relPath)}`, { method: "DELETE" });
  }
  async renameFile(agentPath: string, relPath: string, newName: string): Promise<void> {
    if (!this.cp) return;
    await this.cpFilesFetch(agentPath, "files/rename", {
      method: "POST",
      body: JSON.stringify({ path: relPath, newName }),
    });
  }
  async createFolder(agentPath: string, folderName: string): Promise<{ created: string }> {
    if (!this.cp) return { created: folderName };
    return (await (
      await this.cpFilesFetch(agentPath, "files/folder", {
        method: "POST",
        body: JSON.stringify({ path: folderName }),
      })
    ).json()) as { created: string };
  }

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
  async listRoutines(agentPath: string) {
    if (this.cp) return controlPlane.listRoutines(this.cp, agentPath);
    return [];
  }
  async listRoutineRuns(agentPath: string) {
    if (this.cp) return controlPlane.listRoutineRuns(this.cp, agentPath);
    return [];
  }
  async listSkills(agentPath: string) {
    if (this.cp) return controlPlane.listSkills(this.cp, agentPath);
    return [];
  }

  // ---- providers (auth) ----
  // In cloud every provider call is PER-AGENT: the user connects their OWN
  // ChatGPT/Codex subscription to a specific agent's sandbox (its own auth.json
  // on the PVC). Login is surfaced through the same ProviderLoginUrl/Complete bus
  // events the desktop connect dialog already consumes, so the UI is unchanged.
  async providerStatus(name: string): Promise<ProviderStatus> {
    const pid = toNewProvider(name);
    let configured = false;
    if (pid) {
      try {
        const engine = this.providerEngine();
        if (engine) {
          const s = await engine.authStatus();
          configured = s.providers.find((p) => p.provider === pid)?.configured ?? false;
        }
      } catch {
        /* sandbox unreachable / no agent selected → report not-connected */
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
  // deviceAuth is ignored: the runtime picks the flow itself (Codex → device
  // code, Claude → loopback or copy-paste per the runtime's headless mode).
  async providerLogin(name: string, _opts?: { deviceAuth?: boolean }): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) throw new Error(`provider ${name} not supported`);

    if (!this.cp) {
      // Local single runtime. Drive the legacy login dialog: `device_code`
      // carries the code to display; `url` (loopback) and `auth_code`
      // (headless Claude) leave `user_code` null so the dialog shows a paste
      // field. The runtime emits no completion event, so poll and synthesize.
      const info = await this.engine.startLogin(pid);
      const url = info.kind === "device_code" ? info.verificationUri : info.url;
      const userCode = info.kind === "device_code" ? info.userCode : null;
      emitEvent("ProviderLoginUrl", { provider: name, url, user_code: userCode });
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
      this.watchLoginCompletion(pid, name);
      return;
    }

    // Cloud: start the device-code login in THIS agent's sandbox, then surface it
    // through the bus events the desktop dialog already listens for. `provider`
    // MUST be the old id and the code field MUST be `user_code` (the dialog's
    // contract); a truthy user_code is what opens the device-code panel.
    const agentId = this.requireAgentId();
    const old = toOldProvider(pid);
    const engine = controlPlane.runtimeClientFor(this.cp, agentId);
    const info = await engine.startLogin(pid);
    if (info.kind === "device_code") {
      emitEvent("ProviderLoginUrl", { provider: old, url: info.verificationUri, user_code: info.userCode });
    } else {
      emitEvent("ProviderLoginUrl", { provider: old, url: info.url, user_code: null });
    }
    void this.pollProviderConnect(agentId, pid, old);
  }
  async submitProviderLoginCode(name: string, code: string): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) return;
    const engine = this.cp ? controlPlane.runtimeClientFor(this.cp, this.requireAgentId()) : this.engine;
    await engine.completeLogin(pid, code);
  }
  async cancelProviderLogin(name?: string): Promise<void> {
    if (!name || !toNewProvider(name)) return;
    if (this.cp) {
      const pid = toNewProvider(name);
      const agentId = this.currentAgentId();
      if (pid && agentId) this.activeLogins.delete(`${agentId}:${pid}`); // stop the poll
      return;
    }
    this.stopLoginWatch(name);
    // Benign completion: clears the dialog + spinner without an error toast,
    // matching the old engine's cancel semantics.
    emitEvent("ProviderLoginComplete", { provider: name, success: false, error: null });
  }

  /**
   * Poll auth status until the in-flight login for `pid` resolves, then emit
   * `ProviderLoginComplete` so the legacy dialog closes and the card flips.
   * Covers all three flows: loopback auto-catch, pasted headless code, and
   * device-code polling. Local mode only (cloud uses pollProviderConnect).
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
    if (!pid) return;
    const engine = this.cp ? controlPlane.runtimeClientFor(this.cp, this.requireAgentId()) : this.engine;
    await engine.logout(pid);
  }
  async setGeminiApiKey(): Promise<void> {
    throw new Error("Gemini is not supported by this engine");
  }

  /**
   * Poll the agent's sandbox until the device-code login lands (the runtime
   * polls OpenAI in-process and writes auth.json to the PVC), then make the new
   * provider this agent's active one and signal completion — which closes the
   * dialog and refreshes provider status. Emits a failure on timeout (no silent
   * stall). Cancellable via `cancelProviderLogin`.
   */
  private async pollProviderConnect(agentId: string, pid: ProviderId, oldProvider: string): Promise<void> {
    if (!this.cp) return;
    const key = `${agentId}:${pid}`;
    this.activeLogins.add(key);
    const engine = controlPlane.runtimeClientFor(this.cp, agentId);
    const deadline = Date.now() + 5 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        if (!this.activeLogins.has(key)) return; // cancelled
        let configured = false;
        try {
          const s = await engine.authStatus();
          configured = s.providers.find((p) => p.provider === pid)?.configured ?? false;
        } catch {
          /* transient — keep polling */
        }
        if (configured) {
          // Make the just-connected provider this agent's active model so chat uses it.
          try {
            await engine.setSettings({ activeProvider: pid });
          } catch {
            /* non-fatal: the user can pick the model in the chat header */
          }
          // Connect-once: store this credential for the WHOLE workspace, so every
          // agent (existing + new) shares this one connection.
          try {
            await controlPlane.captureCredential(this.cp, agentId);
          } catch (e) {
            console.error("[connect] workspace credential capture failed", e);
          }
          emitEvent("ProviderLoginComplete", { provider: oldProvider, success: true, error: null });
          return;
        }
      }
      emitEvent("ProviderLoginComplete", {
        provider: oldProvider,
        success: false,
        error: "Connection timed out. Please try connecting again.",
      });
    } finally {
      this.activeLogins.delete(key);
    }
  }

  // ---- sessions / chat ----
  async startSession(agentPath: string, req: SessionStartRequest): Promise<SessionStartResponse> {
    const path = agentPath || DEFAULT_AGENT_PATH;
    // In cloud mode, talk to this agent's sandbox via the control plane's proxy;
    // locally, the single runtime. Either way `streamTurn` is identical.
    const engine = this.cp ? controlPlane.runtimeClientFor(this.cp, path) : this.engine;
    // Fire-and-stream: events flow to the feed store over the bus/WS adapter.
    void streamTurn(engine, path, req.sessionKey, req.prompt);
    return { sessionKey: req.sessionKey };
  }
  async cancelSession(agentPath: string, sessionKey: string) {
    try {
      const engine = this.cp ? controlPlane.runtimeClientFor(this.cp, agentPath) : this.engine;
      await engine.cancel(sessionKey);
    } catch {
      /* already done */
    }
    return { cancelled: true };
  }
  async startOnboarding(_agentPath: string, sessionKey: string): Promise<SessionStartResponse> {
    return { sessionKey };
  }
  async loadChatHistory(agentPath: string, sessionKey: string): Promise<ChatHistoryEntry[]> {
    try {
      const engine = this.cp ? controlPlane.runtimeClientFor(this.cp, agentPath) : this.engine;
      const history = await engine.getHistory(sessionKey);
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
