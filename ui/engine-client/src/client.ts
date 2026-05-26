/**
 * `HoustonClient` — thin fetch wrapper keyed by `{baseUrl, token}`.
 *
 * Usage:
 * ```ts
 * const engine = new HoustonClient({ baseUrl: "http://127.0.0.1:7777", token });
 * const workspaces = await engine.listWorkspaces();
 * ```
 *
 * One method per REST route. DTOs mirror `engine/houston-engine-core`.
 */

import type {
  Activity,
  ActivityUpdate,
  Agent,
  AttachmentManifest,
  AttachmentUploadResult,
  ChatHistoryEntry,
  ClaudeStatus,
  CommunitySkill,
  ComposioAppEntry,
  ComposioStartLinkResponse,
  ComposioStartLoginResponse,
  ComposioStatus,
  ConversationEntry,
  CreateAgent,
  CreateAgentResult,
  CreateAttachmentUploadsResponse,
  CreateSkillRequest,
  CreateWorkspace,
  CreateWorktreeRequest,
  ErrorBody,
  HealthResponse,
  ImportedWorkspace,
  InstallAgent,
  InstallCommunityRequest,
  InstallFromGithub,
  InstallFromRepoRequest,
  InstalledConfig,
  ListWorktreesRequest,
  NewActivity,
  NewRoutine,
  PreferenceValue,
  ProjectConfig,
  ProjectFile,
  ProviderStatus,
  RemoveWorktreeRequest,
  RenameWorkspace,
  RepoSkill,
  Routine,
  RoutineRun,
  RoutineRunUpdate,
  RoutineUpdate,
  RunShellRequest,
  SaveSkillRequest,
  SessionCancelResponse,
  SessionStartRequest,
  SessionStartResponse,
  SkillDetail,
  SkillSummary,
  StoreListing,
  GenerateInstructionsResult,
  SummarizeOptions,
  SummarizeResult,
  TunnelStatus,
  PairingCode,
  PushRegisterRequest,
  UpdateAgent,
  UpdateProvider,
  VersionResponse,
  Workspace,
  WorkspaceContext,
  WorktreeInfo,
  PortableInventoryPreview,
  PortableExportRequest,
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableUploadPreviewResponse,
  PortableScanResponse,
  PortableInstallRequest,
  PortableInstalledAgent,
} from "./types";
import { planAttachmentUploadBatches } from "./attachments";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
}

export class HoustonClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(opts: HoustonClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
  }

  // ---------- transport ----------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    let url = `${this.baseUrl}/v1${path}`;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) q.set(k, v);
      }
      const s = q.toString();
      if (s) url += `?${s}`;
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    if (!res.ok) {
      throw await this.toError(res);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private async rawRequest<T>(
    method: string,
    path: string,
    body?: BodyInit,
    contentType?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      method,
      headers,
      body,
    });
    if (!res.ok) {
      throw await this.toError(res);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private async toError(res: Response): Promise<HoustonEngineError> {
    const err = (await res.json().catch(() => null)) as ErrorBody | null;
    return new HoustonEngineError(res.status, err);
  }

  private seg(s: string): string {
    return encodeURIComponent(s);
  }

  // ---------- health / version ----------

  health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }
  version(): Promise<VersionResponse> {
    return this.request("GET", "/version");
  }

  // ---------- workspaces ----------

  listWorkspaces(): Promise<Workspace[]> {
    return this.request("GET", "/workspaces");
  }
  createWorkspace(req: CreateWorkspace): Promise<Workspace> {
    return this.request("POST", "/workspaces", req);
  }
  renameWorkspace(id: string, req: RenameWorkspace): Promise<Workspace> {
    return this.request("POST", `/workspaces/${this.seg(id)}/rename`, req);
  }
  deleteWorkspace(id: string): Promise<void> {
    return this.request("DELETE", `/workspaces/${this.seg(id)}`);
  }
  setWorkspaceProvider(id: string, req: UpdateProvider): Promise<Workspace> {
    return this.request("PATCH", `/workspaces/${this.seg(id)}/provider`, req);
  }
  installWorkspaceFromGithub(req: InstallFromGithub): Promise<ImportedWorkspace> {
    return this.request("POST", "/workspaces/install-from-github", req);
  }
  getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    return this.request("GET", `/workspaces/${this.seg(id)}/context`);
  }
  setWorkspaceContext(id: string, body: WorkspaceContext): Promise<WorkspaceContext> {
    return this.request("PUT", `/workspaces/${this.seg(id)}/context`, body);
  }

  // ---------- workspace-scoped agents ----------

  listAgents(workspaceId: string): Promise<Agent[]> {
    return this.request("GET", `/workspaces/${this.seg(workspaceId)}/agents`);
  }
  createAgent(workspaceId: string, req: CreateAgent): Promise<CreateAgentResult> {
    return this.request("POST", `/workspaces/${this.seg(workspaceId)}/agents`, req);
  }
  deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}`,
    );
  }
  renameAgent(workspaceId: string, agentId: string, newName: string): Promise<Agent> {
    return this.request(
      "POST",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}/rename`,
      { newName },
    );
  }
  updateAgent(workspaceId: string, agentId: string, req: UpdateAgent): Promise<Agent> {
    return this.request(
      "PATCH",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}`,
      req,
    );
  }

  // ---------- agent files (typed .houston data) ----------

  readAgentFile(agentPath: string, relPath: string): Promise<string> {
    return this.request<{ content: string }>("POST", "/agents/files/read", {
      agent_path: agentPath,
      rel_path: relPath,
    }).then((r) => r.content);
  }
  writeAgentFile(agentPath: string, relPath: string, content: string): Promise<void> {
    return this.request("POST", "/agents/files/write", {
      agent_path: agentPath,
      rel_path: relPath,
      content,
    });
  }
  seedAgentSchemas(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/seed-schemas", { agent_path: agentPath });
  }
  migrateAgentFiles(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/migrate", { agent_path: agentPath });
  }

  // ---------- project files (browser) ----------

  listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
    return this.request("GET", "/agents/files", undefined, { agent_path: agentPath });
  }
  readProjectFile(agentPath: string, relPath: string): Promise<string> {
    return this.request<{ content: string }>("POST", "/agents/files/read-project", {
      agent_path: agentPath,
      rel_path: relPath,
    }).then((r) => r.content);
  }
  renameFile(agentPath: string, relPath: string, newName: string): Promise<void> {
    return this.request("POST", "/agents/files/rename", {
      agent_path: agentPath,
      rel_path: relPath,
      new_name: newName,
    });
  }
  deleteFile(agentPath: string, relPath: string): Promise<void> {
    return this.request("DELETE", "/agents/files", undefined, {
      agent_path: agentPath,
      rel_path: relPath,
    });
  }
  createFolder(agentPath: string, folderName: string): Promise<{ created: string }> {
    return this.request("POST", "/agents/files/folder", {
      agent_path: agentPath,
      folder_name: folderName,
    });
  }
  importFiles(
    agentPath: string,
    filePaths: string[],
    targetFolder?: string,
  ): Promise<ProjectFile[]> {
    return this.request("POST", "/agents/files/import", {
      agent_path: agentPath,
      file_paths: filePaths,
      target_folder: targetFolder ?? null,
    });
  }
  importFileBytes(
    agentPath: string,
    fileName: string,
    dataBase64: string,
  ): Promise<ProjectFile> {
    return this.request("POST", "/agents/files/import-bytes", {
      agent_path: agentPath,
      file_name: fileName,
      data_base64: dataBase64,
    });
  }

  // ---------- agents: activities ----------

  listActivities(agentPath: string): Promise<Activity[]> {
    return this.request("GET", "/agents/activities", undefined, { agent_path: agentPath });
  }
  createActivity(agentPath: string, input: NewActivity): Promise<Activity> {
    return this.request("POST", "/agents/activities", input, { agent_path: agentPath });
  }
  updateActivity(
    agentPath: string,
    id: string,
    updates: ActivityUpdate,
  ): Promise<Activity> {
    return this.request("PATCH", `/agents/activities/${this.seg(id)}`, updates, {
      agent_path: agentPath,
    });
  }
  deleteActivity(agentPath: string, id: string): Promise<void> {
    return this.request("DELETE", `/agents/activities/${this.seg(id)}`, undefined, {
      agent_path: agentPath,
    });
  }

  // ---------- agents: routines ----------

  listRoutines(agentPath: string): Promise<Routine[]> {
    return this.request("GET", "/agents/routines", undefined, { agent_path: agentPath });
  }
  createRoutine(agentPath: string, input: NewRoutine): Promise<Routine> {
    return this.request("POST", "/agents/routines", input, { agent_path: agentPath });
  }
  updateRoutine(agentPath: string, id: string, updates: RoutineUpdate): Promise<Routine> {
    return this.request("PATCH", `/agents/routines/${this.seg(id)}`, updates, {
      agent_path: agentPath,
    });
  }
  deleteRoutine(agentPath: string, id: string): Promise<void> {
    return this.request("DELETE", `/agents/routines/${this.seg(id)}`, undefined, {
      agent_path: agentPath,
    });
  }

  // ---------- agents: routine runs ----------

  listRoutineRuns(agentPath: string, routineId?: string): Promise<RoutineRun[]> {
    return this.request("GET", "/agents/routine-runs", undefined, {
      agent_path: agentPath,
      routine_id: routineId,
    });
  }
  createRoutineRun(agentPath: string, routineId: string): Promise<RoutineRun> {
    return this.request(
      "POST",
      "/agents/routine-runs",
      { routine_id: routineId },
      { agent_path: agentPath },
    );
  }
  updateRoutineRun(
    agentPath: string,
    id: string,
    updates: RoutineRunUpdate,
  ): Promise<RoutineRun> {
    return this.request("PATCH", `/agents/routine-runs/${this.seg(id)}`, updates, {
      agent_path: agentPath,
    });
  }

  // ---------- agents: config ----------

  getAgentConfig(agentPath: string): Promise<ProjectConfig> {
    return this.request("GET", "/agents/config", undefined, { agent_path: agentPath });
  }
  setAgentConfig(agentPath: string, config: ProjectConfig): Promise<ProjectConfig> {
    return this.request("PUT", "/agents/config", config, { agent_path: agentPath });
  }

  // ---------- agent configs (installed manifests) ----------

  listInstalledConfigs(): Promise<InstalledConfig[]> {
    return this.request("GET", "/agent-configs");
  }

  // ---------- conversations ----------

  listConversations(agentPath: string): Promise<ConversationEntry[]> {
    return this.request("POST", "/conversations/list", { agentPath });
  }
  listAllConversations(agentPaths: string[]): Promise<ConversationEntry[]> {
    return this.request("POST", "/conversations/list-all", { agentPaths });
  }

  // ---------- skills ----------

  listSkills(workspacePath: string): Promise<SkillSummary[]> {
    return this.request("GET", "/skills", undefined, { workspacePath });
  }
  loadSkill(workspacePath: string, name: string): Promise<SkillDetail> {
    return this.request("GET", `/skills/${this.seg(name)}`, undefined, { workspacePath });
  }
  createSkill(req: CreateSkillRequest): Promise<void> {
    return this.request("POST", "/skills", req);
  }
  saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
    return this.request("PUT", `/skills/${this.seg(name)}`, req);
  }
  deleteSkill(workspacePath: string, name: string): Promise<void> {
    return this.request("DELETE", `/skills/${this.seg(name)}`, undefined, { workspacePath });
  }
  searchCommunitySkills(query: string, signal?: AbortSignal): Promise<CommunitySkill[]> {
    return this.request("POST", "/skills/community/search", { query }, undefined, signal);
  }
  popularCommunitySkills(signal?: AbortSignal): Promise<CommunitySkill[]> {
    return this.request("POST", "/skills/community/popular", undefined, undefined, signal);
  }
  installCommunitySkill(req: InstallCommunityRequest, signal?: AbortSignal): Promise<string> {
    return this.request("POST", "/skills/community/install", req, undefined, signal);
  }
  listSkillsFromRepo(source: string, signal?: AbortSignal): Promise<RepoSkill[]> {
    return this.request("POST", "/skills/repo/list", { source }, undefined, signal);
  }
  installSkillsFromRepo(req: InstallFromRepoRequest, signal?: AbortSignal): Promise<string[]> {
    return this.request("POST", "/skills/repo/install", req, undefined, signal);
  }

  // ---------- preferences ----------

  getPreference(key: string): Promise<string | null> {
    return this.request<PreferenceValue>("GET", `/preferences/${this.seg(key)}`).then(
      (r) => r.value,
    );
  }
  setPreference(key: string, value: string): Promise<void> {
    return this.request("PUT", `/preferences/${this.seg(key)}`, { value });
  }

  // ---------- providers ----------

  providerStatus(name: string): Promise<ProviderStatus> {
    return this.request("GET", `/providers/${this.seg(name)}/status`);
  }
  /**
   * Launch the provider's CLI login. `opts.deviceAuth` requests the
   * provider's headless device-code flow (OpenAI/codex `--device-auth`)
   * for remote engines that can't receive the CLI's `localhost` OAuth
   * callback. It's ignored by providers without a device flow, and the
   * co-located desktop app omits it to keep the browser-loopback login.
   */
  providerLogin(name: string, opts?: { deviceAuth?: boolean }): Promise<void> {
    return this.request(
      "POST",
      `/providers/${this.seg(name)}/login`,
      undefined,
      opts?.deviceAuth ? { deviceAuth: "true" } : undefined,
    );
  }
  providerLogout(name: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/logout`);
  }
  /**
   * Submit the OAuth verification code the user pasted from their
   * browser. Required for remote/headless engines (container,
   * Always-On VPS, future Cloud) where the CLI can't open the user's
   * browser itself: the engine surfaces the sign-in URL via the WS
   * `ProviderLoginUrl` event, the UI displays it + a paste-code
   * input, and this call writes the code back to the CLI's stdin so
   * it can exchange for an OAuth token. The engine emits
   * `ProviderLoginComplete` when the CLI exits.
   */
  submitProviderLoginCode(name: string, code: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/login/code`, {
      code,
    });
  }
  /**
   * Abort an in-flight browser sign-in. The engine kills the provider
   * CLI subprocess and frees the in-flight slot so a follow-up
   * `providerLogin` isn't rejected as "already pending". Use this when
   * the user gives up on the OAuth tab (closed the browser, stuck
   * spinner): without it they'd be stuck until the 10-min relay
   * timeout. Idempotent — cancelling with nothing pending is a no-op.
   * The engine emits a benign `ProviderLoginComplete` (`success:
   * false`, no `error`) so subscribers clear their pending state
   * without showing an error toast.
   */
  cancelProviderLogin(name: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/login/cancel`);
  }
  /**
   * Persist a Gemini API key to `~/.gemini/.env`. The engine validates
   * the key shape, writes atomically, and chmods 0600 on Unix. The
   * next `providerStatus("gemini")` poll will return `Authenticated`
   * without requiring a Houston restart.
   *
   * Gemini-specific: other providers use the CLI's own OAuth flow via
   * `providerLogin`. Do NOT generalize this route until a second
   * provider needs it.
   */
  setGeminiApiKey(apiKey: string): Promise<void> {
    return this.request("POST", "/providers/gemini/credentials", { apiKey });
  }
  // "Sign in with Google" for Gemini goes through the standard
  // `providerLogin("gemini")` call — the engine detects the gemini id
  // and delegates to gemini-cli's own OAuth via the ACP `authenticate`
  // JSON-RPC method. gemini-cli opens the browser with its own Google
  // app identity and writes its own credential files. Same shape as
  // `claude auth login --claudeai` and `codex login`.

  // ---------- store ----------

  storeCatalog(): Promise<StoreListing[]> {
    return this.request("GET", "/store/catalog");
  }
  storeSearch(q: string): Promise<StoreListing[]> {
    return this.request("GET", "/store/search", undefined, { q });
  }
  installStoreAgent(req: InstallAgent): Promise<void> {
    return this.request("POST", "/store/installs", req);
  }
  uninstallStoreAgent(agentId: string): Promise<void> {
    return this.request("DELETE", `/store/installs/${this.seg(agentId)}`);
  }
  installAgentFromGithub(req: InstallFromGithub): Promise<{ agentId: string }> {
    return this.request("POST", "/agents/install-from-github", req);
  }
  checkAgentUpdates(): Promise<string[]> {
    return this.request("POST", "/agents/check-updates");
  }

  // ---------- attachments ----------

  async saveAttachments(scopeId: string, files: File[]): Promise<string[]> {
    if (files.length === 0) return [];
    const paths = new Array<string>(files.length);

    for (const batch of planAttachmentUploadBatches(files)) {
      const batchFiles = files.slice(batch.start, batch.end);
      const created = await this.request<CreateAttachmentUploadsResponse>(
        "POST",
        "/attachments/uploads",
        {
          scopeId,
          files: batchFiles.map((f) => ({
            name: f.name,
            size: f.size,
            mime: f.type || null,
          })),
        },
      );
      if (created.uploads.length !== batchFiles.length) {
        throw new Error("engine returned mismatched attachment upload count");
      }
      await this.uploadAttachmentBatch(batch.start, batchFiles, created, paths);
    }
    return paths;
  }

  private async uploadAttachmentBatch(
    offset: number,
    files: File[],
    created: CreateAttachmentUploadsResponse,
    paths: string[],
  ): Promise<void> {
    let next = 0;
    let firstError: unknown;
    const worker = async () => {
      while (next < files.length && firstError === undefined) {
        const index = next;
        next += 1;
        const upload = created.uploads[index];
        try {
          const result = await this.rawRequest<AttachmentUploadResult>(
            "PUT",
            upload.uploadUrl.replace(/^\/v1/, ""),
            files[index],
            files[index].type || "application/octet-stream",
          );
          paths[offset + index] = result.path;
        } catch (err) {
          firstError = err;
        }
      }
    };
    const workers = Array.from({ length: Math.min(3, files.length) }, () => worker());
    await Promise.all(workers);
    if (firstError !== undefined) throw firstError;
  }
  deleteAttachments(scopeId: string): Promise<void> {
    return this.request("DELETE", `/attachments/${this.seg(scopeId)}`);
  }
  listAttachments(scopeId: string): Promise<AttachmentManifest[]> {
    return this.request("GET", `/attachments/${this.seg(scopeId)}`);
  }

  // ---------- worktree / shell ----------

  createWorktree(req: CreateWorktreeRequest): Promise<WorktreeInfo> {
    return this.request("POST", "/worktrees", req);
  }
  listWorktrees(req: ListWorktreesRequest): Promise<WorktreeInfo[]> {
    return this.request("POST", "/worktrees/list", req);
  }
  removeWorktree(req: RemoveWorktreeRequest): Promise<void> {
    return this.request("POST", "/worktrees/remove", req);
  }
  runShell(req: RunShellRequest): Promise<string> {
    return this.request("POST", "/shell", req);
  }

  // ---------- tunnel (mobile pairing + device-token management) ----------

  tunnelStatus(): Promise<TunnelStatus> {
    return this.request("GET", "/tunnel/status");
  }
  mintPairingCode(): Promise<PairingCode> {
    return this.request("POST", "/tunnel/pairing");
  }
  resetPhoneAccess(): Promise<PairingCode> {
    return this.request("POST", "/tunnel/reset-access");
  }

  // ---------- push (mobile notification registration) ----------

  registerPushDevice(req: PushRegisterRequest): Promise<{ ok: boolean }> {
    return this.request("POST", "/push/register", req);
  }
  unregisterPushDevice(deviceToken: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", "/push/unregister", { deviceToken });
  }

  // ---------- sessions ----------

  /** Start a session. `agentPath` is percent-encoded as a single path segment. */
  startSession(
    agentPath: string,
    req: SessionStartRequest,
  ): Promise<SessionStartResponse> {
    return this.request("POST", `/agents/${this.seg(agentPath)}/sessions`, req);
  }
  cancelSession(agentPath: string, sessionKey: string): Promise<SessionCancelResponse> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentPath)}/sessions/${this.seg(sessionKey)}:cancel`,
    );
  }
  startOnboarding(agentPath: string, sessionKey: string): Promise<SessionStartResponse> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentPath)}/sessions/onboarding`,
      { sessionKey },
    );
  }
  loadChatHistory(agentPath: string, sessionKey: string): Promise<ChatHistoryEntry[]> {
    return this.request(
      "GET",
      `/agents/${this.seg(agentPath)}/sessions/${this.seg(sessionKey)}/history`,
    );
  }
  summarizeActivity(message: string, opts: SummarizeOptions = {}): Promise<SummarizeResult> {
    return this.request("POST", "/sessions/summarize", {
      message,
      agentPath: opts.agentPath,
      provider: opts.provider,
      model: opts.model,
    });
  }

  generateAgentInstructions(
    description: string,
    opts: { provider?: string; model?: string; signal?: AbortSignal } = {},
  ): Promise<GenerateInstructionsResult> {
    return this.request(
      "POST",
      "/sessions/generate-instructions",
      { description, provider: opts.provider, model: opts.model },
      undefined,
      opts.signal,
    );
  }

  // ---------- routine scheduler ----------

  runRoutineNow(agentPath: string, routineId: string): Promise<void> {
    return this.request("POST", `/routines/${this.seg(routineId)}/run-now`, undefined, {
      agentPath,
    });
  }
  cancelRoutineRun(
    agentPath: string,
    routineId: string,
    runId: string,
  ): Promise<RoutineRun> {
    return this.request(
      "POST",
      `/routines/${this.seg(routineId)}/runs/${this.seg(runId)}:cancel`,
      undefined,
      { agentPath },
    );
  }
  startRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/start", undefined, { agentPath });
  }
  stopRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/stop", undefined, { agentPath });
  }
  syncRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/sync", undefined, { agentPath });
  }

  // ---------- agent file watcher ----------

  startAgentWatcher(agentPath: string): Promise<void> {
    return this.request("POST", "/watcher/start", { agentPath });
  }
  stopAgentWatcher(): Promise<void> {
    return this.request("POST", "/watcher/stop");
  }

  // ---------- claude (runtime installer) ----------

  /**
   * Snapshot of the runtime Claude Code install — used by the
   * onboarding "Sign in with Anthropic" card so it can show a clear
   * "couldn't reach Anthropic" / "Retry" instead of the misleading
   * "install it yourself" hint that fires for every other
   * `cli_installed=false` case (issue #231).
   */
  claudeStatus(): Promise<ClaudeStatus> {
    return this.request("GET", "/claude/status");
  }
  /**
   * Kick off a fresh install in the background. The HTTP request
   * returns immediately; progress + completion stream over the WS
   * firehose as `ClaudeCliInstalling` / `ClaudeCliReady` /
   * `ClaudeCliFailed` events.
   */
  claudeInstall(): Promise<void> {
    return this.request("POST", "/claude/install");
  }

  // ---------- composio ----------

  composioStatus(): Promise<ComposioStatus> {
    return this.request("GET", "/composio/status");
  }
  composioCliInstalled(): Promise<boolean> {
    return this.request<{ installed: boolean }>("GET", "/composio/cli-installed").then(
      (r) => r.installed,
    );
  }
  composioInstallCli(): Promise<void> {
    return this.request("POST", "/composio/cli");
  }
  composioStartLogin(): Promise<ComposioStartLoginResponse> {
    return this.request("POST", "/composio/login");
  }
  composioCompleteLogin(cliKey: string): Promise<void> {
    return this.request("POST", "/composio/login/complete", { cliKey });
  }
  composioLogout(): Promise<void> {
    return this.request("POST", "/composio/logout");
  }
  composioListApps(): Promise<ComposioAppEntry[]> {
    return this.request("GET", "/composio/apps");
  }
  composioListConnections(): Promise<string[]> {
    return this.request("GET", "/composio/connections");
  }
  composioConnectApp(toolkit: string): Promise<ComposioStartLinkResponse> {
    return this.request("POST", "/composio/connections", { toolkit });
  }
  /**
   * Ask the engine to actively watch for `toolkit` to land in the
   * consumer connections list and emit `ComposioConnectionAdded` over
   * the WS firehose when it does. Idempotent — duplicate calls while
   * a watch is active are no-ops on the engine. Returns immediately;
   * the result arrives as a WS event.
   */
  composioWatchConnection(toolkit: string): Promise<void> {
    return this.request("POST", "/composio/connections/watch", { toolkit });
  }

  // ---------- portable agent share / import ----------

  portablePreview(agentPath: string): Promise<PortableInventoryPreview> {
    return this.request("GET", "/agents/portable/preview", undefined, {
      agentPath,
    });
  }
  async portablePackage(
    agentPath: string,
    req: PortableExportRequest,
  ): Promise<ArrayBuffer> {
    const res = await fetch(
      `${this.baseUrl}/v1/agents/portable/package?agentPath=${encodeURIComponent(agentPath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
      },
    );
    if (!res.ok) throw await this.toError(res);
    return await res.arrayBuffer();
  }
  portableAnonymize(
    agentPath: string,
    req: PortableAnonymizeRequest,
  ): Promise<PortableAnonymizeResponse> {
    return this.request("POST", "/agents/portable/anonymize", req, {
      agentPath,
    });
  }
  async importPreview(
    bytes: ArrayBuffer | Uint8Array,
  ): Promise<PortableUploadPreviewResponse> {
    return this.rawRequest(
      "POST",
      "/store/imports/preview",
      bytes as BodyInit,
      "application/zip",
    );
  }
  importScan(packageId: string): Promise<PortableScanResponse> {
    return this.request("POST", "/store/imports/scan", { packageId });
  }
  importInstall(req: PortableInstallRequest): Promise<PortableInstalledAgent> {
    return this.request("POST", "/store/imports/install", req);
  }

  // ---------- WebSocket access (see ws.ts) ----------

  wsUrl(): string {
    const ws = this.baseUrl.replace(/^http/, "ws");
    return `${ws}/v1/ws?token=${encodeURIComponent(this.token)}`;
  }
}

export class HoustonEngineError extends Error {
  constructor(public status: number, public body: ErrorBody | null) {
    super(body?.error.message ?? `Engine error ${status}`);
    this.name = "HoustonEngineError";
  }

  get code(): string | undefined {
    return this.body?.error.code;
  }

  /**
   * Stable machine-readable tag set by the engine for typed errors
   * (e.g. `rate_limited`, `offline`, `already_installed`,
   * `repo_private`). UI matches on this to render plain-English copy
   * instead of parsing `message`. See `engine/houston-engine-core/src/skills.rs`
   * for the canonical kind list.
   */
  get kind(): string | undefined {
    const details = this.body?.error.details;
    if (details && typeof details === "object" && "kind" in details) {
      const k = (details as { kind?: unknown }).kind;
      return typeof k === "string" ? k : undefined;
    }
    return undefined;
  }
}

/** Type guard for engine errors. Convenient in catch blocks. */
export function isHoustonEngineError(e: unknown): e is HoustonEngineError {
  return e instanceof HoustonEngineError;
}
