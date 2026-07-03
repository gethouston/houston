import { migrateProviderModel } from "@houston/domain";
import {
  type CustomEndpoint,
  HoustonEngineClient,
  type ProviderId,
} from "@houston/runtime-client";
import type {
  Activity,
  ActivityUpdate,
  Agent,
  Capabilities,
  ChatHistoryEntry,
  ConversationEntry,
  CreateAgent,
  CreateAgentResult,
  CreateSkillRequest,
  NewActivity,
  NewRoutine,
  ProjectConfig,
  ProjectFile,
  ProviderStatus,
  Routine,
  RoutineUpdate,
  SaveSkillRequest,
  SessionStartRequest,
  SessionStartResponse,
  UpdateAgent,
  Workspace,
} from "../../../../ui/engine-client/src/types";
import * as activities from "./activities";
import {
  readAgentFile as readAgentFileStore,
  writeAgentFile as writeAgentFileStore,
} from "./agent-files";
import * as agents from "./agents";
import { bus, emitEvent } from "./bus";
import type { ControlPlaneConfig } from "./control-plane";
import * as controlPlane from "./control-plane";
import type { BoardStatus } from "./feed-events";
import {
  configWriteToSettings,
  credentialSiblings,
  DEFAULT_AGENT_ID,
  DEFAULT_AGENT_PATH,
  DEFAULT_WORKSPACE_ID,
  syntheticWorkspace,
  toNewProvider,
  toOldProvider,
} from "./synthetic";
import { historyToFeed } from "./translate";
import { observeConversation, streamTurn } from "./turn-stream";

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
  private baseUrl: string;
  private token: string;
  /** Non-null in cloud mode: agents + chat go through the control plane. */
  private cp: ControlPlaneConfig | null;
  /** In-flight cloud device-code logins, keyed `${agentId}:${providerId}` — the poll guard. */
  private activeLogins = new Set<string>();
  /** Per-provider auth-status pollers that translate login completion into events (local mode). */
  private loginWatchers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(opts: HoustonClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    const useCp =
      opts.controlPlane ??
      (typeof window !== "undefined" && !!window.__HOUSTON_CP__);
    this.cp = useCp
      ? { baseUrl: opts.baseUrl.replace(/\/+$/, ""), token: opts.token }
      : null;
    this.engine = new HoustonEngineClient({
      baseUrl: opts.baseUrl,
      token: opts.token || undefined,
    });
    // Mark the new TS engine as the active backend so the frontend can surface
    // new-engine-only capabilities (e.g. API-key providers like OpenCode). The
    // Rust engine uses the real `@houston-ai/engine-client`, never this adapter,
    // so the flag stays unset there.
    if (typeof window !== "undefined") {
      (
        window as unknown as { __HOUSTON_NEW_ENGINE__?: boolean }
      ).__HOUSTON_NEW_ENGINE__ = true;
    }
    // biome-ignore lint/correctness/noConstructorReturn: Proxy provides transparent fallback stubs for unsupported HoustonClient methods; callers use `new HoustonClient()` directly so a static factory would require changes across many files outside this module.
    return new Proxy(this, {
      get(target, prop, recv) {
        if (prop in target || typeof prop === "symbol")
          return Reflect.get(target, prop, recv);
        return async () => {
          console.warn(
            `[engine-adapter] unsupported HoustonClient.${String(prop)}() → []`,
          );
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
      // Cloud: providers are PER-AGENT, reached through the control-plane proxy
      // (the per-agent runtime client carries the live token). A top-level
      // /providers on the base client has no route and a stale token → 401.
      const engine = this.providerEngine();
      if (engine) {
        const providers = await engine.listProviders();
        const active =
          providers.find((p) => p.isActive) ??
          providers.find((p) => p.configured);
        if (active)
          return {
            provider: toOldProvider(active.id),
            model: active.activeModel,
          };
      }
    } catch {
      /* engine unreachable / no agent selected / not authed → defaults below */
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
  async capabilities(): Promise<Capabilities> {
    // Raw fetch (not `this.engine.capabilities()`) on purpose: the inner engine
    // client captured its token at construction, but hosted mode rotates the
    // Supabase bearer mid-session, so we MUST read the live token here.
    const res = await fetch(`${this.baseUrl}/v1/capabilities`, {
      headers: {
        Authorization: `Bearer ${controlPlane.liveToken(this.token)}`,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new HoustonEngineError(res.status, body);
    }
    return (await res.json()) as Capabilities;
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
    return {
      ...syntheticWorkspace(provider, model),
      name: req?.name || "Houston",
    };
  }
  async renameWorkspace(): Promise<Workspace> {
    const { provider, model } = await this.activeOld();
    return syntheticWorkspace(provider, model);
  }
  async deleteWorkspace(): Promise<void> {}
  async setWorkspaceLocale(
    _id: string,
    locale: string | null,
  ): Promise<Workspace> {
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
  async createAgent(
    workspaceId: string,
    req: CreateAgent,
  ): Promise<CreateAgentResult> {
    if (this.cp)
      return {
        agent: await controlPlane.createAgent(this.cp, req.name, req.color),
      };
    return agents.createAgent(workspaceId, req);
  }
  async renameAgent(
    workspaceId: string,
    agentId: string,
    newName: string,
  ): Promise<Agent> {
    if (this.cp) return controlPlane.renameAgent(this.cp, agentId, newName);
    return agents.renameAgent(workspaceId, agentId, newName);
  }
  async updateAgent(
    workspaceId: string,
    agentId: string,
    req: UpdateAgent,
  ): Promise<Agent> {
    if (this.cp)
      return controlPlane.updateAgentColor(this.cp, agentId, req.color);
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
  async setAgentConfig(
    agentPath: string,
    config: ProjectConfig,
  ): Promise<ProjectConfig> {
    if (config.provider) {
      // Migrate legacy provider+model ids to ones pi-ai accepts (the runtime's
      // getModel throws on an unknown id → a hard-failed turn). Fail-soft: an
      // unknown value lands on the default + records a diagnostic, never a throw.
      const { provider, model, diagnostics } = migrateProviderModel(
        config.provider,
        config.model,
      );
      for (const d of diagnostics)
        console.warn(`[engine-adapter] migrated agent model: ${d.message}`);
      // Settings are PER-AGENT on the host (`/agents/:id/settings`); the host
      // root has no `/settings` route. In cloud / desktop-new-engine mode this
      // MUST go through the agent's runtime client (the same one activeOld()
      // READS from) — writing via the root client silently 404s, so a model
      // pick never persists and every turn falls back to the active provider.
      const engine = this.cp
        ? controlPlane.runtimeClientFor(
            this.cp,
            agentPath || this.requireAgentId(),
          )
        : this.engine;
      await engine.setSettings({ activeProvider: provider, model });
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
  async createActivity(
    agentPath: string,
    input: NewActivity,
  ): Promise<Activity> {
    if (this.cp) return controlPlane.createActivity(this.cp, agentPath, input);
    return activities.createActivity(agentPath, input);
  }
  async updateActivity(
    agentPath: string,
    id: string,
    updates: ActivityUpdate,
  ): Promise<Activity> {
    if (this.cp)
      return controlPlane.updateActivity(this.cp, agentPath, id, updates);
    return activities.updateActivity(agentPath, id, updates);
  }
  async deleteActivity(agentPath: string, id: string): Promise<void> {
    if (this.cp) return controlPlane.deleteActivity(this.cp, agentPath, id);
    activities.deleteActivity(agentPath, id);
  }

  /**
   * Transition a chat activity's board status, honoring cloud vs standalone mode.
   * The board READS activities from the host in cloud mode (listActivities →
   * control plane), so a turn's status write MUST reach the host too — a
   * localStorage write (the standalone store) would never show up on the board
   * and the card would hang in "running". Matches by session_key, or the
   * `activity-<id>` convention the board uses for missions with no explicit key.
   */
  private async setActivityStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
  ): Promise<void> {
    if (!this.cp) {
      activities.setStatusBySessionKey(agentPath, sessionKey, status);
      return;
    }
    const list = await controlPlane.listActivities(this.cp, agentPath);
    const match = list.find(
      (a) => a.session_key === sessionKey || `activity-${a.id}` === sessionKey,
    );
    if (!match) return; // transient session with no board card — nothing to update
    await controlPlane.updateActivity(this.cp, agentPath, match.id, { status });
  }

  // ---- agent data files (.houston/**) ----
  // Cloud: the host serves raw .houston docs off the agent's workspace vfs (this
  // is what the desktop UI's board/config/learnings actually read). Standalone
  // web: localStorage.
  async readAgentFile(agentPath: string, relPath: string): Promise<string> {
    if (this.cp) return controlPlane.readAgentFile(this.cp, agentPath, relPath);
    return readAgentFileStore(agentPath, relPath);
  }
  async writeAgentFile(
    agentPath: string,
    relPath: string,
    content: string,
  ): Promise<void> {
    if (this.cp) {
      await controlPlane.writeAgentFile(this.cp, agentPath, relPath, content);
    } else {
      writeAgentFileStore(agentPath, relPath, content);
    }
    // The runtime resolves the model from its OWN settings (activeProvider +
    // models[provider]), NOT from this .houston/config doc — which is the only
    // thing the model picker writes. Without mirroring, picking a different model
    // (e.g. a non-default OpenCode Go model) updates the doc but every turn keeps
    // running the provider's default. Bridge the config write into the engine.
    await this.syncConfigToSettings(agentPath, relPath, content);
  }

  /**
   * Mirror a per-agent `config.json` write (provider + model) into the engine's
   * settings, so a model/provider pick in the chat picker actually changes what
   * the next turn runs. Best-effort: the doc write already succeeded, and the
   * picker only offers connected providers, so a failure here is logged (never a
   * silent model swap) but doesn't fail the file write.
   */
  private async syncConfigToSettings(
    agentPath: string,
    relPath: string,
    content: string,
  ): Promise<void> {
    const update = configWriteToSettings(relPath, content);
    if (!update) return;
    try {
      const engine = this.cp
        ? controlPlane.runtimeClientFor(this.cp, agentPath)
        : this.engine;
      await engine.setSettings(update);
    } catch (err) {
      console.error(
        "[engine-adapter] failed to sync the model selection to the engine:",
        err,
      );
    }
  }
  async seedAgentSchemas(): Promise<void> {}
  async migrateAgentFiles(): Promise<void> {}

  // ---- composer attachments ----
  // Cloud: upload the dropped files into the selected agent's workspace via the
  // host's /agents/:id/attachments route; the runtime's clamped file tools then
  // Read them at the relative paths returned here (the sender encodes those paths
  // into the message). Standalone web has no workspace to write into — fail loud.
  async saveAttachments(scopeId: string, files: File[]): Promise<string[]> {
    if (files.length === 0) return [];
    if (!this.cp) throw new Error("Attachments need a cloud workspace.");
    return controlPlane.saveAttachments(
      this.cp,
      this.requireAgentId(),
      scopeId,
      files,
    );
  }
  async deleteAttachments(scopeId: string): Promise<void> {
    if (!this.cp) throw new Error("Attachments need a cloud workspace.");
    return controlPlane.deleteAttachments(
      this.cp,
      this.requireAgentId(),
      scopeId,
    );
  }

  // ---- project files (the agent's REAL workspace) ----
  // In cloud mode the workspace is a GCS prefix served by the control plane at
  // /agents/:id/files*. agentPath IS the agentId here (folderPath = agent.id).
  // In synthetic/local web mode there is no real workspace, so these are inert.
  private async cpFilesFetch(
    agentId: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    if (!this.cp)
      throw new Error("cpFilesFetch called without a control-plane config");
    const cp = this.cp;
    const res = await fetch(
      `${cp.baseUrl}/agents/${encodeURIComponent(agentId)}/${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${controlPlane.liveToken(cp.token)}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      },
    );
    if (!res.ok)
      throw new HoustonEngineError(
        res.status,
        await res.json().catch(() => ({})),
      );
    return res;
  }
  async listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
    if (!this.cp) return [];
    return (await (
      await this.cpFilesFetch(agentPath, "files")
    ).json()) as ProjectFile[];
  }
  async readProjectFile(agentPath: string, relPath: string): Promise<string> {
    if (!this.cp) return "";
    const res = await this.cpFilesFetch(
      agentPath,
      `files/read?path=${encodeURIComponent(relPath)}`,
    );
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
      contentType:
        res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  async deleteFile(agentPath: string, relPath: string): Promise<void> {
    if (!this.cp) return;
    await this.cpFilesFetch(
      agentPath,
      `files?path=${encodeURIComponent(relPath)}`,
      { method: "DELETE" },
    );
  }
  async renameFile(
    agentPath: string,
    relPath: string,
    newName: string,
  ): Promise<void> {
    if (!this.cp) return;
    await this.cpFilesFetch(agentPath, "files/rename", {
      method: "POST",
      body: JSON.stringify({ path: relPath, newName }),
    });
  }
  async createFolder(
    agentPath: string,
    folderName: string,
  ): Promise<{ created: string }> {
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
    // The board/missions list is derived from activities; in cloud those live on
    // the host (this.listActivities un-fakes it), not localStorage.
    const acts = await this.listActivities(agentPath);
    return acts.map((a) => ({
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
  async listAllConversations(
    agentPaths: string[],
  ): Promise<ConversationEntry[]> {
    const all = await Promise.all(
      agentPaths.map((p) => this.listConversations(p)),
    );
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

  // Routine + skill mutations route to the host (cloud); standalone web has no
  // routine/skill backend, so they no-op there (the UI still navigates).
  async createRoutine(agentPath: string, input: NewRoutine): Promise<Routine> {
    if (this.cp) return controlPlane.createRoutine(this.cp, agentPath, input);
    return {} as Routine;
  }
  async updateRoutine(
    agentPath: string,
    id: string,
    updates: RoutineUpdate,
  ): Promise<Routine> {
    if (this.cp)
      return controlPlane.updateRoutine(this.cp, agentPath, id, updates);
    return {} as Routine;
  }
  async deleteRoutine(agentPath: string, id: string): Promise<void> {
    if (this.cp) return controlPlane.deleteRoutine(this.cp, agentPath, id);
  }
  /** Fire a routine on demand: the host records a routine_run and starts the turn now. */
  async runRoutineNow(agentPath: string, routineId: string): Promise<void> {
    if (this.cp)
      return controlPlane.runRoutineNow(this.cp, agentPath, routineId);
    throw new Error("Running a routine needs a cloud workspace.");
  }
  async createSkill(req: CreateSkillRequest): Promise<void> {
    if (this.cp)
      return controlPlane.createSkill(this.cp, req.workspacePath, {
        name: req.name,
        description: req.description,
        content: req.content,
      });
  }
  async saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
    if (this.cp)
      return controlPlane.saveSkill(
        this.cp,
        req.workspacePath,
        name,
        req.content,
      );
  }
  async deleteSkill(workspacePath: string, name: string): Promise<void> {
    if (this.cp) return controlPlane.deleteSkill(this.cp, workspacePath, name);
  }

  // ---- providers (auth) ----
  // In cloud every provider call is PER-AGENT: the user connects their OWN
  // ChatGPT/Codex subscription to a specific agent's sandbox (its own auth.json
  // on the PVC). Login is surfaced through the same ProviderLoginUrl/Complete bus
  // events the desktop connect dialog already consumes, so the UI is unchanged.
  async providerStatus(name: string): Promise<ProviderStatus> {
    const pid = toNewProvider(name);
    let configured = false;
    let activeModel: string | undefined;
    if (pid) {
      try {
        const engine = this.providerEngine();
        if (engine) {
          // listProviders (not authStatus) so we also learn the configured
          // model id — the OpenAI-compatible provider's model is dynamic and
          // absent from the static catalog, so the picker has no other source.
          // `configured` here matches authStatus for credential providers and
          // is endpoint-aware for the local one.
          const p = (await engine.listProviders()).find((x) => x.id === pid);
          configured = p?.configured ?? false;
          activeModel = p?.activeModel || undefined;
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
      activeModel,
    } as ProviderStatus;
  }
  // `deviceAuth` is the client's "I can't catch a loopback callback" flag — the
  // co-located desktop sends false (it CAN), remote webapps send true. It steers
  // Codex's flow (false → browser/loopback, true → device code); Claude keys off
  // the runtime's own headless mode regardless. Default true so a caller that
  // omits it never asks a remote runtime for an unreachable loopback.
  async providerLogin(
    name: string,
    opts?: { deviceAuth?: boolean; enterpriseDomain?: string },
  ): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) throw new Error(`provider ${name} not supported`);
    const deviceAuth = opts?.deviceAuth ?? true;
    // GitHub Copilot: the company GitHub domain when the user chose the Company
    // plan in the connect dialog. Undefined => Personal/github.com (and every
    // other provider). The runtime runs the device-code flow against that GitHub.
    const enterpriseDomain = opts?.enterpriseDomain;

    if (!this.cp) {
      // Local single runtime. Drive the legacy login dialog: `device_code`
      // carries the code to display; `url` (loopback) and `auth_code`
      // (headless Claude) leave `user_code` null so the dialog shows a paste
      // field. The runtime emits no completion event, so poll and synthesize.
      const info = await this.engine.startLogin(
        pid,
        deviceAuth,
        enterpriseDomain,
      );
      const url = info.kind === "device_code" ? info.verificationUri : info.url;
      const userCode = info.kind === "device_code" ? info.userCode : null;
      emitEvent("ProviderLoginUrl", {
        provider: name,
        url,
        user_code: userCode,
      });
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
      this.watchLoginCompletion(pid, name);
      return;
    }

    // Control-plane path (cloud sandbox OR the desktop host sidecar). Start the
    // login in THIS agent's runtime and surface it on the bus the picker/settings
    // handler consumes. A remote runtime returns a device_code (we pass its
    // `user_code`, which opens the code panel); a co-located desktop client gets
    // a loopback `url` (user_code null) that the handler opens straight in the
    // browser. `provider` MUST be the old/frontend id (the dialog's contract).
    const agentId = this.requireAgentId();
    const old = toOldProvider(pid);
    const engine = controlPlane.runtimeClientFor(this.cp, agentId);
    const info = await engine.startLogin(pid, deviceAuth, enterpriseDomain);
    if (info.kind === "device_code") {
      emitEvent("ProviderLoginUrl", {
        provider: old,
        url: info.verificationUri,
        user_code: info.userCode,
      });
    } else {
      emitEvent("ProviderLoginUrl", {
        provider: old,
        url: info.url,
        user_code: null,
      });
    }
    void this.pollProviderConnect(agentId, pid, old);
  }
  async submitProviderLoginCode(name: string, code: string): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) return;
    const engine = this.cp
      ? controlPlane.runtimeClientFor(this.cp, this.requireAgentId())
      : this.engine;
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
    emitEvent("ProviderLoginComplete", {
      provider: name,
      success: false,
      error: null,
    });
  }

  /**
   * Poll auth status until the in-flight login for `pid` resolves, then emit
   * `ProviderLoginComplete` so the legacy dialog closes and the card flips.
   * Covers all three flows: loopback auto-catch, pasted headless code, and
   * device-code polling. Local mode only (cloud uses pollProviderConnect).
   */
  private watchLoginCompletion(pid: ProviderId, name: string): void {
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
          else if (pr?.login?.status === "error")
            finish(false, pr?.login?.error ?? "Login failed");
          else if (Date.now() - startedAt > 10 * 60 * 1000)
            finish(false, "Login timed out");
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
    // Sign-out clears every gateway the connect card represents — for OpenCode
    // that's both Zen and Go, since one key connected both. Clearing a gateway
    // that was never connected is a benign no-op.
    const targets = credentialSiblings(pid);
    if (this.cp) {
      // Connect-once logout. Clearing only the runtime's local auth.json (what
      // engine.logout does) is NOT enough: the credential also lives in the
      // workspace's CENTRAL store, and the runtime re-pulls it from the host
      // before every turn — so the next message re-hydrated the agent and the
      // provider showed connected again. Forget the central credential FIRST so
      // no in-flight turn can re-serve it, then clear the runtime's local copy.
      const agentId = this.requireAgentId();
      for (const target of targets) {
        await controlPlane.forgetCredential(this.cp, agentId, target);
        await controlPlane.runtimeClientFor(this.cp, agentId).logout(target);
      }
      return;
    }
    for (const target of targets) {
      await this.engine.logout(target);
    }
  }

  /**
   * Connect an API-key provider (OpenCode Zen / Go): the user pastes a key, no
   * OAuth dance. Cloud stores it centrally (and pushes it into the agent runtime)
   * via the control plane; local writes it straight to the single runtime. On
   * success we fire `ProviderLoginComplete` so the connect dialog closes and the
   * provider card flips to connected — the same signal the OAuth flow emits. A
   * failure rejects so the caller surfaces the real reason (never swallowed).
   */
  async setProviderApiKey(name: string, apiKey: string): Promise<void> {
    const pid = toNewProvider(name);
    if (!pid) throw new Error(`provider ${name} not supported`);
    // OpenCode's Zen + Go gateways share one opencode.ai key (pi reads
    // OPENCODE_API_KEY for both), so store the pasted key under every sibling
    // gateway — one connect lights up both. `pid` (the connected id) is the one
    // that becomes active; the order of the writes doesn't affect that.
    const targets = credentialSiblings(pid);
    if (this.cp) {
      const agentId = this.requireAgentId();
      for (const target of targets) {
        await controlPlane.setApiKey(this.cp, agentId, target, apiKey);
      }
      // Make the just-connected provider active so chats use it immediately,
      // exactly as the OAuth connect path does (pollProviderConnect). Without
      // this the engine keeps whatever was active (e.g. a still-connected Codex),
      // and every turn silently runs that model instead of OpenCode. Settings are
      // PER-AGENT on the host, so this MUST go through the agent's runtime client.
      await controlPlane
        .runtimeClientFor(this.cp, agentId)
        .setSettings({ activeProvider: pid });
    } else {
      for (const target of targets) {
        await this.engine.setApiKey(target, apiKey);
      }
      await this.engine.setSettings({ activeProvider: pid });
    }
    // One completion event for the single account the user connected (never one
    // per gateway), so the connect dialog closes and exactly one card flips.
    emitEvent("ProviderLoginComplete", {
      provider: name,
      success: true,
      error: null,
    });
  }

  /**
   * Connect an OpenAI-compatible (local) server: persist the base URL + model
   * and make it active, then fire `ProviderLoginComplete` like the other connect
   * paths. LOCAL/desktop only — in cloud the host refuses (the openaiCompatible
   * capability is off), so the error surfaces to the dialog. Settings are
   * PER-AGENT on the host, so activation MUST go through the agent's runtime
   * client (mirrors setProviderApiKey).
   */
  async setProviderCustomEndpoint(endpoint: CustomEndpoint): Promise<void> {
    if (this.cp) {
      const agentId = this.requireAgentId();
      await controlPlane.setCustomEndpoint(this.cp, agentId, endpoint);
      await controlPlane
        .runtimeClientFor(this.cp, agentId)
        .setSettings({ activeProvider: "openai-compatible" });
    } else {
      await this.engine.setCustomEndpoint(endpoint);
      await this.engine.setSettings({ activeProvider: "openai-compatible" });
    }
    emitEvent("ProviderLoginComplete", {
      provider: "openai-compatible",
      success: true,
      error: null,
    });
  }

  /**
   * Poll the agent's sandbox until the device-code login lands (the runtime
   * polls OpenAI in-process and writes auth.json to the PVC), then make the new
   * provider this agent's active one and signal completion — which closes the
   * dialog and refreshes provider status. Emits a failure on timeout (no silent
   * stall). Cancellable via `cancelProviderLogin`.
   */
  private async pollProviderConnect(
    agentId: string,
    pid: ProviderId,
    oldProvider: string,
  ): Promise<void> {
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
          configured =
            s.providers.find((p) => p.provider === pid)?.configured ?? false;
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
            await controlPlane.captureCredential(this.cp, agentId, pid);
          } catch (e) {
            console.error("[connect] workspace credential capture failed", e);
          }
          emitEvent("ProviderLoginComplete", {
            provider: oldProvider,
            success: true,
            error: null,
          });
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
  async startSession(
    agentPath: string,
    req: SessionStartRequest,
  ): Promise<SessionStartResponse> {
    const path = agentPath || DEFAULT_AGENT_PATH;
    // In cloud mode, talk to this agent's sandbox via the control plane's proxy;
    // locally, the single runtime. Either way `streamTurn` is identical.
    const engine = this.cp
      ? controlPlane.runtimeClientFor(this.cp, path)
      : this.engine;
    // Fire-and-stream: events flow to the feed store over the bus/WS adapter.
    // The board-status setter is cloud-aware (writes land where the board reads).
    void streamTurn(engine, path, req.sessionKey, req.prompt, (status) =>
      this.setActivityStatus(path, req.sessionKey, status),
    );
    return { sessionKey: req.sessionKey };
  }
  async cancelSession(agentPath: string, sessionKey: string) {
    const engine = this.cp
      ? controlPlane.runtimeClientFor(this.cp, agentPath)
      : this.engine;
    // Abort the agent's in-flight turn. The engine reports whether a turn was
    // ACTUALLY in flight. `false` means there was nothing to abort: the turn is
    // orphaned — its board card is stuck "running" because the turn died without
    // settling (an error that never reached a terminal frame, or an app restart
    // that dropped the in-memory turn). Stop is the user's escape hatch, so in
    // that case settle the card ourselves. A genuinely live turn (`true`) is
    // settled by its own `streamTurn` when the abort lands, so we leave its
    // status alone — writing it here too would race that terminal write.
    const { cancelled } = await engine.cancel(sessionKey);
    if (cancelled !== true) {
      await this.setActivityStatus(agentPath, sessionKey, "needs_you");
    }
    return { cancelled: cancelled === true };
  }
  async startOnboarding(
    _agentPath: string,
    sessionKey: string,
  ): Promise<SessionStartResponse> {
    return { sessionKey };
  }
  async loadChatHistory(
    agentPath: string,
    sessionKey: string,
    opts: { observe?: boolean } = {},
  ): Promise<ChatHistoryEntry[]> {
    try {
      const engine = this.cp
        ? controlPlane.runtimeClientFor(this.cp, agentPath)
        : this.engine;
      const history = await engine.getHistory(sessionKey);
      // Observer mode: a loaded chat may have a turn in flight that THIS client
      // isn't streaming (page reloaded mid-turn, or another client sent it).
      // Attach a passive resumable stream: if the server's `sync` reports a
      // running turn it surfaces (spinner + partial) and renders to completion;
      // an idle conversation closes the stream right after that `sync`. No-op
      // when the conversation is already streamed here. `observe: false` is
      // for BULK history reads (mission search, board scans) that load N
      // conversations at a time and must not spawn N streams — only a real
      // conversation open observes (the default).
      if (opts.observe !== false) {
        observeConversation(
          engine,
          agentPath,
          sessionKey,
          (status) => this.setActivityStatus(agentPath, sessionKey, status),
          history.messages.length,
        );
      }
      return historyToFeed(history.messages);
    } catch {
      return [];
    }
  }
  /**
   * Ask the engine to summarize the user's first message into a short mission
   * title. Cloud: the per-agent runtime client (the same path other conversation
   * calls take) runs an LLM title turn in the agent's sandbox. Local: the single
   * runtime. A clean truncation fallback covers an empty model reply, a missing
   * agent, or any transport failure — the title is cosmetic, never block the send.
   */
  async summarizeActivity(message: string, opts: { agentPath?: string } = {}) {
    const truncated =
      message.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    try {
      const agentId = opts.agentPath || this.currentAgentId() || undefined;
      const engine = this.cp
        ? agentId
          ? controlPlane.runtimeClientFor(this.cp, agentId)
          : null
        : this.engine;
      if (engine) {
        const { title } = await engine.summarizeText(message);
        const clean = title.trim();
        if (clean) return { title: clean, description: "" };
      }
    } catch {
      /* engine unreachable / not authed / no agent → fall back to truncation */
    }
    return { title: truncated, description: "" };
  }

  // ---- integrations (Composio, platform mode) — host only ----
  async integrationStatus(): Promise<controlPlane.IntegrationProviderStatus[]> {
    if (!this.cp) return [];
    return controlPlane.integrationStatus(this.cp);
  }
  async setIntegrationSession(token: string | null): Promise<void> {
    if (!this.cp) return;
    return controlPlane.setIntegrationSession(this.cp, token);
  }
  async integrationToolkits(
    provider: string,
  ): Promise<controlPlane.IntegrationToolkit[]> {
    if (!this.cp) return [];
    return controlPlane.integrationToolkits(this.cp, provider);
  }
  async integrationConnections(
    provider: string,
  ): Promise<controlPlane.IntegrationConnection[]> {
    if (!this.cp) return [];
    return controlPlane.integrationConnections(this.cp, provider);
  }
  async connectIntegration(
    provider: string,
    toolkit: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    if (!this.cp) throw new Error("Integrations require a connected host");
    return controlPlane.connectIntegration(this.cp, provider, toolkit);
  }
  async integrationConnection(
    provider: string,
    connectionId: string,
  ): Promise<controlPlane.IntegrationConnection> {
    if (!this.cp) throw new Error("Integrations require a connected host");
    return controlPlane.integrationConnection(this.cp, provider, connectionId);
  }
  async disconnectIntegration(
    provider: string,
    toolkit: string,
  ): Promise<void> {
    if (!this.cp) return;
    return controlPlane.disconnectIntegration(this.cp, provider, toolkit);
  }
  async dismissIntegrationsReconnectNotice(): Promise<void> {
    // The notice only ever renders from a host-reported `reconnect` flag, so
    // dismissing without a host is a real failure — surface it, don't no-op.
    if (!this.cp) throw new Error("Integrations require a connected host");
    return controlPlane.dismissIntegrationsReconnectNotice(this.cp);
  }

  // ---- org / roles (multiplayer) — hosted gateway only ----
  async getOrg(): Promise<controlPlane.OrgInfo> {
    if (!this.cp) throw new Error("multiplayer requires the hosted gateway");
    return controlPlane.getOrg(this.cp);
  }
  async addOrgMember(email: string, role: controlPlane.OrgRole): Promise<void> {
    if (!this.cp) throw new Error("multiplayer requires the hosted gateway");
    return controlPlane.addOrgMember(this.cp, email, role);
  }
  async removeOrgMember(userId: string): Promise<void> {
    if (!this.cp) throw new Error("multiplayer requires the hosted gateway");
    return controlPlane.removeOrgMember(this.cp, userId);
  }
  async setOrgMemberRole(
    userId: string,
    role: controlPlane.OrgRole,
  ): Promise<void> {
    if (!this.cp) throw new Error("multiplayer requires the hosted gateway");
    return controlPlane.setOrgMemberRole(this.cp, userId, role);
  }

  // ---- per-agent assignments + integration grants (multiplayer) ----
  async setAgentAssignments(
    agentSlugOrId: string,
    userIds: string[],
  ): Promise<void> {
    if (!this.cp) throw new Error("multiplayer requires the hosted gateway");
    return controlPlane.setAgentAssignments(this.cp, agentSlugOrId, userIds);
  }
  // Grants degrade like `integrationStatus`: single-player has no grants model,
  // so read is empty and write is a no-op rather than a hard failure.
  async agentIntegrationGrants(agentSlugOrId: string): Promise<string[]> {
    if (!this.cp) return [];
    return controlPlane.agentIntegrationGrants(this.cp, agentSlugOrId);
  }
  async setAgentIntegrationGrants(
    agentSlugOrId: string,
    toolkits: string[],
  ): Promise<void> {
    if (!this.cp) return;
    return controlPlane.setAgentIntegrationGrants(
      this.cp,
      agentSlugOrId,
      toolkits,
    );
  }

  // ---- lifecycle no-ops the shell calls ----
  async startAgentWatcher(): Promise<void> {}
  async stopAgentWatcher(): Promise<void> {}
  async startRoutineScheduler(): Promise<void> {}
  async stopRoutineScheduler(): Promise<void> {}
  async syncRoutineScheduler(): Promise<void> {}

  wsUrl(): string {
    return "";
  }

  /** @internal — exposed so the WS adapter can identify the default agent. */
  defaultAgentId(): string {
    return DEFAULT_AGENT_ID;
  }
}
