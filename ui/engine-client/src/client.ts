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

import { planAttachmentUploadBatches } from "./attachments.ts";
import type {
  Activity,
  ActivityUpdate,
  Agent,
  AttachmentManifest,
  AttachmentUploadResult,
  Capabilities,
  ChatHistoryEntry,
  ClaudeStatus,
  CommunitySkill,
  ComposioAppEntry,
  ComposioReconnectResponse,
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
  CustomEndpoint,
  ErrorBody,
  GenerateInstructionsResult,
  HealthResponse,
  ImportedWorkspace,
  InstallAgent,
  InstallCommunityRequest,
  InstalledConfig,
  InstallFromGithub,
  InstallFromRepoRequest,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  ListWorktreesRequest,
  NewActivity,
  NewRoutine,
  OrgInfo,
  OrgRole,
  PairingCode,
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
  PortableExportRequest,
  PortableInstalledAgent,
  PortableInstallRequest,
  PortableInventoryPreview,
  PortableScanResponse,
  PortableUploadPreviewResponse,
  PreferenceValue,
  ProjectConfig,
  ProjectFile,
  ProviderStatus,
  PushRegisterRequest,
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
  SummarizeOptions,
  SummarizeResult,
  TunnelStatus,
  UpdateAgent,
  UpdateProvider,
  VersionResponse,
  Workspace,
  WorkspaceContext,
  WorktreeInfo,
} from "./types.ts";

/**
 * Transport retry tuning. Defaults target the desktop loopback sidecar +
 * mobile reverse-tunnel; tests override with tiny delays for determinism.
 */
export interface RetryConfig {
  /** Hard cap on total attempts (initial + retries). */
  maxAttempts: number;
  /** First backoff in ms, doubled each retry up to `maxDelayMs`. */
  baseDelayMs: number;
  /** Per-wait backoff ceiling in ms. */
  maxDelayMs: number;
  /** Overall wall-clock budget in ms; once exceeded we stop retrying. */
  deadlineMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 8,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
  deadlineMs: 10_000,
};

/** 502/504 (gateway) + 503 (unavailable) — the mobile reverse-tunnel path
 *  can surface these while the far end is restarting. The desktop loopback
 *  engine never returns them, so this only matters for tunneled clients. */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** Methods safe to replay after a SERVER response (a mutation may have
 *  partially run). A thrown network error is handled separately and IS safe
 *  to replay for any method — see `HoustonClient.send`. */
function isIdempotentMethod(method: string): boolean {
  return (
    method === "GET" ||
    method === "HEAD" ||
    method === "PUT" ||
    method === "DELETE" ||
    method === "OPTIONS"
  );
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Base64-encode bytes without blowing the call stack on large files (chunked btoa). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function makeAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return e;
}

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
  /** Override transport retry tuning (tests, latency-sensitive hosts). */
  retry?: Partial<RetryConfig>;
  /** Injectable `fetch` for tests / non-browser hosts. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class HoustonClient {
  // Mutable so the desktop supervisor can repoint us at a fresh
  // `{baseUrl, token}` when it restarts a crashed engine on a NEW random port
  // (HOU-432) — without every cached client reference going stale. In-flight
  // retries re-read these on each attempt, so they recover transparently.
  private baseUrl: string;
  private token: string;
  private readonly retryConfig: RetryConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HoustonClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.retryConfig = { ...DEFAULT_RETRY, ...opts.retry };
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * Point this client at a new engine endpoint in place. The desktop app
   * calls this when the supervisor respawns the engine on a fresh port so
   * requests already mid-flight (and every hook holding this instance)
   * recover on their next retry instead of hammering the dead port. See
   * `app/src/lib/engine.ts`.
   */
  setEndpoint(opts: { baseUrl: string; token: string }): void {
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
    retryable?: boolean,
  ): Promise<T> {
    const res = await this.send(
      () => {
        let url = `${this.baseUrl}/v1${path}`;
        if (query) {
          const q = new URLSearchParams();
          for (const [k, v] of Object.entries(query)) {
            if (v !== undefined && v !== null) q.set(k, v);
          }
          const s = q.toString();
          if (s) url += `?${s}`;
        }
        return {
          url,
          init: {
            method,
            headers: {
              Authorization: `Bearer ${this.token}`,
              ...(body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          },
        };
      },
      // Idempotent methods replay safely; a POST only replays when the caller
      // explicitly marks it read-only (see `replaySafe` doc on `send`).
      retryable ?? isIdempotentMethod(method),
      signal,
    );
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
    const res = await this.send(
      () => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.token}`,
        };
        if (contentType) headers["Content-Type"] = contentType;
        return {
          url: `${this.baseUrl}/v1${path}`,
          init: { method, headers, body },
        };
      },
      // Attachment uploads are PUTs to a keyed URL (idempotent); the only
      // non-idempotent rawRequest is the import-preview POST, which stays off.
      isIdempotentMethod(method),
    );
    if (!res.ok) {
      throw await this.toError(res);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  /**
   * Single retrying fetch path shared by every request. `build` is invoked
   * once per attempt so retries pick up the CURRENT endpoint + token (the
   * supervisor may have swapped them via `setEndpoint` after an engine
   * restart). This is the core of the HOU-432 fix: a localhost sidecar that
   * WebKit drops under burst load, or that the supervisor restarts on a new
   * port, would otherwise surface a bare `TypeError: Load failed` to the user.
   *
   * Retry is gated on `replaySafe` because `fetch` CANNOT distinguish "the
   * request never reached the engine" from "the engine ran it, but the
   * response was lost" — both surface as a thrown `TypeError`. Replaying the
   * latter double-executes a side effect (e.g. `startSession` spawns the chat
   * turn before it flushes its 200, with no server-side dedup → a duplicate
   * agent turn + double provider billing). So:
   *
   *   - `replaySafe` is true for idempotent HTTP methods (GET/HEAD/PUT/DELETE/
   *     OPTIONS) and for the curated read-only POSTs that mark themselves
   *     (`readAgentFile`, `listConversations`, …). For these, a thrown
   *     `TypeError` AND a 502/503/504 response are retried.
   *   - Mutating POSTs (`startSession`, `create*`, `install*`, …) are
   *     `replaySafe: false` and never auto-retried — a real failure surfaces
   *     immediately so the user can re-issue the action deliberately.
   *   - `AbortError` (caller cancelled) is never retried, and any failure that
   *     races a cancellation is normalized to an `AbortError` so the app's
   *     "abort suppresses the toast" contract holds.
   *
   * Bounded by `maxAttempts` AND a wall-clock `deadlineMs`; on exhaustion the
   * last error / response propagates so the UI still surfaces a real failure
   * toast — no silent swallowing.
   */
  private async send(
    build: () => { url: string; init: RequestInit },
    replaySafe: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const { maxAttempts, deadlineMs } = this.retryConfig;
    const start = Date.now();
    let attempt = 0;
    for (;;) {
      if (signal?.aborted) throw makeAbortError();
      attempt += 1;
      const { url, init } = build();
      const remaining = () => deadlineMs - (Date.now() - start);
      const canRetryAgain = () =>
        replaySafe && attempt < maxAttempts && remaining() > 0;
      try {
        const res = await this.fetchImpl(url, { ...init, signal });
        if (res.ok) return res;
        if (RETRYABLE_STATUS.has(res.status) && canRetryAgain()) {
          await this.backoff(attempt, remaining(), signal);
          continue;
        }
        // A non-ok response we won't retry: if the caller cancelled in the
        // meantime, report the cancellation rather than the stale status.
        if (signal?.aborted) throw makeAbortError();
        return res;
      } catch (err) {
        // Caller cancelled — surface as AbortError (the app suppresses those),
        // even if the underlying rejection was a racing transport TypeError.
        if (signal?.aborted) throw makeAbortError();
        if (isAbortError(err)) throw err;
        // `fetch` reports every transport failure as a TypeError; that's our
        // retry signal for replay-safe requests.
        if (err instanceof TypeError && canRetryAgain()) {
          await this.backoff(attempt, remaining(), signal);
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Full-jitter exponential backoff, abortable via `signal` and clamped to the
   * remaining deadline budget so a late wait can't overshoot it. Assumes the
   * request body is re-readable (JSON string / File / Blob / typed array) —
   * never use a one-shot streaming body on a replay-safe request.
   */
  private backoff(
    attempt: number,
    remainingMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const { baseDelayMs, maxDelayMs } = this.retryConfig;
    const ceil = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** (attempt - 1),
      Math.max(0, remainingMs),
    );
    const delay = Math.random() * ceil;
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(makeAbortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(makeAbortError());
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
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
  capabilities(): Promise<Capabilities> {
    return this.request("GET", "/capabilities");
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
  /**
   * Set (or clear) a workspace's UI-locale override. Pass `null` to clear it
   * so the workspace falls back to the global `locale` preference. Persisted on
   * the workspace record, so every client of this engine shares the value.
   */
  setWorkspaceLocale(id: string, locale: string | null): Promise<Workspace> {
    return this.request("PATCH", `/workspaces/${this.seg(id)}/locale`, {
      locale,
    });
  }
  setWorkspaceProvider(id: string, req: UpdateProvider): Promise<Workspace> {
    return this.request("PATCH", `/workspaces/${this.seg(id)}/provider`, req);
  }
  installWorkspaceFromGithub(
    req: InstallFromGithub,
  ): Promise<ImportedWorkspace> {
    return this.request("POST", "/workspaces/install-from-github", req);
  }
  getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    return this.request("GET", `/workspaces/${this.seg(id)}/context`);
  }
  setWorkspaceContext(
    id: string,
    body: WorkspaceContext,
  ): Promise<WorkspaceContext> {
    return this.request("PUT", `/workspaces/${this.seg(id)}/context`, body);
  }

  // ---------- workspace-scoped agents ----------

  listAgents(workspaceId: string): Promise<Agent[]> {
    return this.request("GET", `/workspaces/${this.seg(workspaceId)}/agents`);
  }
  createAgent(
    workspaceId: string,
    req: CreateAgent,
  ): Promise<CreateAgentResult> {
    return this.request(
      "POST",
      `/workspaces/${this.seg(workspaceId)}/agents`,
      req,
    );
  }
  deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}`,
    );
  }
  renameAgent(
    workspaceId: string,
    agentId: string,
    newName: string,
  ): Promise<Agent> {
    return this.request(
      "POST",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}/rename`,
      { newName },
    );
  }
  updateAgent(
    workspaceId: string,
    agentId: string,
    req: UpdateAgent,
  ): Promise<Agent> {
    return this.request(
      "PATCH",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}`,
      req,
    );
  }

  // ---------- agent files (typed .houston data) ----------

  readAgentFile(agentPath: string, relPath: string): Promise<string> {
    // Read-only POST → replay-safe (this is the route that dominated HOU-432).
    return this.request<{ content: string }>(
      "POST",
      "/agents/files/read",
      { agent_path: agentPath, rel_path: relPath },
      undefined,
      undefined,
      true,
    ).then((r) => r.content);
  }
  writeAgentFile(
    agentPath: string,
    relPath: string,
    content: string,
  ): Promise<void> {
    return this.request("POST", "/agents/files/write", {
      agent_path: agentPath,
      rel_path: relPath,
      content,
    });
  }
  seedAgentSchemas(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/seed-schemas", {
      agent_path: agentPath,
    });
  }
  migrateAgentFiles(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/migrate", {
      agent_path: agentPath,
    });
  }

  // ---------- project files (browser) ----------

  listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
    return this.request("GET", "/agents/files", undefined, {
      agent_path: agentPath,
    });
  }
  readProjectFile(agentPath: string, relPath: string): Promise<string> {
    // Read-only POST → replay-safe.
    return this.request<{ content: string }>(
      "POST",
      "/agents/files/read-project",
      { agent_path: agentPath, rel_path: relPath },
      undefined,
      undefined,
      true,
    ).then((r) => r.content);
  }
  /** Raw bytes of a project file (binary-safe) plus its served MIME type. */
  async downloadProjectFile(
    agentPath: string,
    relPath: string,
  ): Promise<{ blob: Blob; contentType: string }> {
    const q = new URLSearchParams({ agent_path: agentPath, rel_path: relPath });
    // GET → replay-safe; route through `send` so it inherits retries + the
    // injectable `fetchImpl` like every other request (HOU-432 parity).
    const res = await this.send(
      () => ({
        url: `${this.baseUrl}/v1/agents/files/download?${q}`,
        init: {
          method: "GET",
          headers: { Authorization: `Bearer ${this.token}` },
        },
      }),
      true,
    );
    if (!res.ok) {
      throw await this.toError(res);
    }
    return {
      blob: await res.blob(),
      contentType:
        res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  renameFile(
    agentPath: string,
    relPath: string,
    newName: string,
  ): Promise<void> {
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
  createFolder(
    agentPath: string,
    folderName: string,
  ): Promise<{ created: string }> {
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
  /** Upload browser Files into the agent's workspace (Files tab drag-drop /
   * Browse). This engine's import route takes one file per request and has no
   * target-folder parameter, so uploads land at the workspace root. */
  async uploadProjectFiles(
    agentPath: string,
    files: File[],
    _targetDir?: string | null,
  ): Promise<void> {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      await this.importFileBytes(agentPath, f.name, bytesToBase64(bytes));
    }
  }
  /** This engine has no move route; the Files tab only offers drag-move on the
   * TS host. Refuse loudly rather than pretend the file moved. */
  async moveProjectFile(
    _agentPath: string,
    _relPath: string,
    _toDir: string | null,
  ): Promise<void> {
    throw new Error("Moving files is not supported on this engine.");
  }
  /** This engine has no archive route ("Download all" is a TS-host feature);
   * it is never offered in the UI here, so refuse loudly if reached. */
  async downloadProjectArchive(
    _agentPath: string,
  ): Promise<{ blob: Blob; contentType: string }> {
    throw new Error("Downloading all files is not supported on this engine.");
  }

  // ---------- agents: activities ----------

  listActivities(agentPath: string): Promise<Activity[]> {
    return this.request("GET", "/agents/activities", undefined, {
      agent_path: agentPath,
    });
  }
  createActivity(agentPath: string, input: NewActivity): Promise<Activity> {
    return this.request("POST", "/agents/activities", input, {
      agent_path: agentPath,
    });
  }
  updateActivity(
    agentPath: string,
    id: string,
    updates: ActivityUpdate,
  ): Promise<Activity> {
    return this.request(
      "PATCH",
      `/agents/activities/${this.seg(id)}`,
      updates,
      {
        agent_path: agentPath,
      },
    );
  }
  deleteActivity(agentPath: string, id: string): Promise<void> {
    return this.request(
      "DELETE",
      `/agents/activities/${this.seg(id)}`,
      undefined,
      {
        agent_path: agentPath,
      },
    );
  }

  // ---------- routines ----------
  //
  // CRUD lives on the canonical `/routines` + `/routine-runs` surface (the
  // scheduler, dispatcher, and run-now/cancel all share it). These methods use
  // the `agentPath` / `routineId` camelCase query params that surface expects.

  listRoutines(agentPath: string): Promise<Routine[]> {
    return this.request("GET", "/routines", undefined, { agentPath });
  }
  createRoutine(agentPath: string, input: NewRoutine): Promise<Routine> {
    return this.request("POST", "/routines", input, { agentPath });
  }
  updateRoutine(
    agentPath: string,
    id: string,
    updates: RoutineUpdate,
  ): Promise<Routine> {
    return this.request("PATCH", `/routines/${this.seg(id)}`, updates, {
      agentPath,
    });
  }
  deleteRoutine(agentPath: string, id: string): Promise<void> {
    return this.request("DELETE", `/routines/${this.seg(id)}`, undefined, {
      agentPath,
    });
  }

  // ---------- routine runs ----------

  listRoutineRuns(
    agentPath: string,
    routineId?: string,
  ): Promise<RoutineRun[]> {
    return this.request("GET", "/routine-runs", undefined, {
      agentPath,
      routineId,
    });
  }
  createRoutineRun(agentPath: string, routineId: string): Promise<RoutineRun> {
    return this.request(
      "POST",
      `/routines/${this.seg(routineId)}/runs`,
      undefined,
      {
        agentPath,
      },
    );
  }
  updateRoutineRun(
    agentPath: string,
    id: string,
    updates: RoutineRunUpdate,
  ): Promise<RoutineRun> {
    return this.request("PATCH", `/routine-runs/${this.seg(id)}`, updates, {
      agentPath,
    });
  }

  // ---------- agents: config ----------

  getAgentConfig(agentPath: string): Promise<ProjectConfig> {
    return this.request("GET", "/agents/config", undefined, {
      agent_path: agentPath,
    });
  }
  setAgentConfig(
    agentPath: string,
    config: ProjectConfig,
  ): Promise<ProjectConfig> {
    return this.request("PUT", "/agents/config", config, {
      agent_path: agentPath,
    });
  }

  // ---------- agent configs (installed manifests) ----------

  listInstalledConfigs(): Promise<InstalledConfig[]> {
    return this.request("GET", "/agent-configs");
  }

  // ---------- conversations ----------

  listConversations(agentPath: string): Promise<ConversationEntry[]> {
    // Read-only POST → replay-safe.
    return this.request(
      "POST",
      "/conversations/list",
      { agentPath },
      undefined,
      undefined,
      true,
    );
  }
  listAllConversations(agentPaths: string[]): Promise<ConversationEntry[]> {
    // Read-only POST → replay-safe.
    return this.request(
      "POST",
      "/conversations/list-all",
      { agentPaths },
      undefined,
      undefined,
      true,
    );
  }

  // ---------- skills ----------

  listSkills(workspacePath: string): Promise<SkillSummary[]> {
    return this.request("GET", "/skills", undefined, { workspacePath });
  }
  loadSkill(workspacePath: string, name: string): Promise<SkillDetail> {
    return this.request("GET", `/skills/${this.seg(name)}`, undefined, {
      workspacePath,
    });
  }
  createSkill(req: CreateSkillRequest): Promise<void> {
    return this.request("POST", "/skills", req);
  }
  saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
    return this.request("PUT", `/skills/${this.seg(name)}`, req);
  }
  deleteSkill(workspacePath: string, name: string): Promise<void> {
    return this.request("DELETE", `/skills/${this.seg(name)}`, undefined, {
      workspacePath,
    });
  }
  searchCommunitySkills(
    query: string,
    signal?: AbortSignal,
  ): Promise<CommunitySkill[]> {
    // Read-only search POST → replay-safe.
    return this.request(
      "POST",
      "/skills/community/search",
      { query },
      undefined,
      signal,
      true,
    );
  }
  popularCommunitySkills(signal?: AbortSignal): Promise<CommunitySkill[]> {
    // Read-only POST → replay-safe.
    return this.request(
      "POST",
      "/skills/community/popular",
      undefined,
      undefined,
      signal,
      true,
    );
  }
  installCommunitySkill(
    req: InstallCommunityRequest,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.request(
      "POST",
      "/skills/community/install",
      req,
      undefined,
      signal,
    );
  }
  listSkillsFromRepo(
    source: string,
    signal?: AbortSignal,
  ): Promise<RepoSkill[]> {
    // Read-only listing POST → replay-safe.
    return this.request(
      "POST",
      "/skills/repo/list",
      { source },
      undefined,
      signal,
      true,
    );
  }
  installSkillsFromRepo(
    req: InstallFromRepoRequest,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.request("POST", "/skills/repo/install", req, undefined, signal);
  }

  // ---------- preferences ----------

  getPreference(key: string): Promise<string | null> {
    return this.request<PreferenceValue>(
      "GET",
      `/preferences/${this.seg(key)}`,
    ).then((r) => r.value);
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
   *
   * `opts.enterpriseDomain` (GitHub Copilot Enterprise) only matters on the
   * new TS engine, where the control-plane adapter overrides this method; the
   * legacy Rust path has no Copilot provider, so it's passed through harmlessly.
   */
  providerLogin(
    name: string,
    opts?: { deviceAuth?: boolean; enterpriseDomain?: string },
  ): Promise<void> {
    const query: Record<string, string> = {};
    if (opts?.deviceAuth) query.deviceAuth = "true";
    if (opts?.enterpriseDomain) query.enterpriseDomain = opts.enterpriseDomain;
    return this.request(
      "POST",
      `/providers/${this.seg(name)}/login`,
      undefined,
      Object.keys(query).length ? query : undefined,
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
  /**
   * Connect an API-key provider (OpenCode Zen / Go) by submitting a pasted key.
   * Only the new TS engine serves these providers; the UI gates the call behind
   * `newEngineActive()`, so on the legacy Rust engine this route is never hit.
   */
  setProviderApiKey(name: string, apiKey: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/api-key`, {
      apiKey,
    });
  }
  /**
   * Connect an OpenAI-compatible (local) server by base URL + model. The legacy
   * Rust engine has no such provider — it's new-engine + desktop only, and the
   * connect UI is gated on `newEngineActive()` + desktop, so this is never hit
   * here. Reject loudly rather than pretend to succeed (no silent failure).
   */
  setProviderCustomEndpoint(_endpoint: CustomEndpoint): Promise<void> {
    return Promise.reject(new Error("Local models require the new engine."));
  }
  // "Sign in with Google" for Gemini goes through the standard
  // `providerLogin("gemini")` call — the engine detects the gemini id
  // and delegates to gemini-cli's own OAuth via the ACP `authenticate`
  // JSON-RPC method. gemini-cli opens the browser with its own Google
  // app identity and writes its own credential files. Same shape as
  // `claude auth login --claudeai` and `codex login`.

  // ---------- integrations (Composio platform mode) — v3 host only ----------
  //
  // The Rust engine has no /v1/integrations routes; the UI gates these on the
  // control-plane build (engine-mode), so on the legacy wire they never run.
  // Kept here so the shared app typechecks against both clients (shim parity).

  async integrationStatus(): Promise<IntegrationProviderStatus[]> {
    return (
      await this.request<{ items: IntegrationProviderStatus[] }>(
        "GET",
        "/integrations",
      )
    ).items;
  }
  /** Keep the desktop gateway's Supabase session fresh (null on sign-out). */
  async setIntegrationSession(token: string | null): Promise<void> {
    await this.request("PUT", "/integrations/session", { token });
  }
  async integrationToolkits(provider: string): Promise<IntegrationToolkit[]> {
    return (
      await this.request<{ items: IntegrationToolkit[] }>(
        "GET",
        `/integrations/${this.seg(provider)}/toolkits`,
      )
    ).items;
  }
  async integrationConnections(
    provider: string,
  ): Promise<IntegrationConnection[]> {
    return (
      await this.request<{ items: IntegrationConnection[] }>(
        "GET",
        `/integrations/${this.seg(provider)}/connections`,
      )
    ).items;
  }
  connectIntegration(
    provider: string,
    toolkit: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    return this.request("POST", `/integrations/${this.seg(provider)}/connect`, {
      toolkit,
    });
  }
  /** Poll one connection after connect() until the OAuth finishes. */
  integrationConnection(
    provider: string,
    connectionId: string,
  ): Promise<IntegrationConnection> {
    return this.request(
      "GET",
      `/integrations/${this.seg(provider)}/connections/${this.seg(connectionId)}`,
    );
  }
  async disconnectIntegration(
    provider: string,
    toolkit: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/integrations/${this.seg(provider)}/disconnect`,
      { toolkit },
    );
  }
  /**
   * Dismiss the "reconnect your apps" notice by deleting the legacy
   * credentials server-side; afterwards `integrationStatus()` reports no
   * `reconnect` flag.
   */
  async dismissIntegrationsReconnectNotice(): Promise<void> {
    await this.request("POST", "/integrations/reconnect-notice/dismiss");
  }

  // ---------- org / roles (multiplayer) — v3 host only ----------
  //
  // The Rust engine has no /v1/org routes; multiplayer is a hosted-gateway
  // feature, so on the legacy wire these never run. Kept here so the shared app
  // typechecks against both clients (shim parity), same as integrations above.

  /** The current user's org + role (and, for owner/admin, the member roster). */
  getOrg(): Promise<OrgInfo> {
    return this.request("GET", "/org");
  }
  /** Invite a member by email at a role. Owner/admin only (enforced by the host). */
  async addOrgMember(email: string, role: OrgRole): Promise<void> {
    await this.request("POST", "/org/members", { email, role });
  }
  /** Remove a member from the org. */
  async removeOrgMember(userId: string): Promise<void> {
    await this.request("DELETE", `/org/members/${this.seg(userId)}`);
  }
  /** Change a member's role. */
  async setOrgMemberRole(userId: string, role: OrgRole): Promise<void> {
    await this.request("PATCH", `/org/members/${this.seg(userId)}`, { role });
  }

  // ---------- per-agent assignments + integration grants (multiplayer) ----------

  /**
   * Set which org members may use this agent. Empty `userIds` means "everyone".
   * Owner/admin only.
   */
  async setAgentAssignments(
    agentSlugOrId: string,
    userIds: string[],
  ): Promise<void> {
    await this.request(
      "PUT",
      `/agents/${this.seg(agentSlugOrId)}/assignments`,
      { userIds },
    );
  }
  /**
   * The integration toolkit slugs granted to this agent, or `null` when the host
   * does not serve grants (404) — a deployment without per-agent grants (e.g. a
   * managed cloud pod whose gateway owns the policy). Callers treat `null` as
   * "grants unsupported here" and degrade silently; every other error still
   * throws. Any host that DOES serve grants answers 200 with the set.
   */
  async agentIntegrationGrants(
    agentSlugOrId: string,
  ): Promise<string[] | null> {
    try {
      return (
        await this.request<{ toolkits: string[] }>(
          "GET",
          `/agents/${this.seg(agentSlugOrId)}/integration-grants`,
        )
      ).toolkits;
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }
  /** Replace the integration toolkit slugs granted to this agent. */
  async setAgentIntegrationGrants(
    agentSlugOrId: string,
    toolkits: string[],
  ): Promise<void> {
    await this.request(
      "PUT",
      `/agents/${this.seg(agentSlugOrId)}/integration-grants`,
      { toolkits },
    );
  }

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
    // Read-only update check POST → replay-safe.
    return this.request(
      "POST",
      "/agents/check-updates",
      undefined,
      undefined,
      undefined,
      true,
    );
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
    const workers = Array.from({ length: Math.min(3, files.length) }, () =>
      worker(),
    );
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
    // Read-only listing POST → replay-safe.
    return this.request(
      "POST",
      "/worktrees/list",
      req,
      undefined,
      undefined,
      true,
    );
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
  /**
   * Drop one queued (not yet sent) message from a conversation's send queue.
   * INERT here: the queue lives in the host engine-adapter (the aliased
   * implementation every build runs); this stub only keeps the unaliased
   * surface shape-identical.
   */
  removeQueuedMessage(
    _agentPath: string,
    _sessionKey: string,
    _id: string,
  ): void {}
  cancelSession(
    agentPath: string,
    sessionKey: string,
  ): Promise<SessionCancelResponse> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentPath)}/sessions/${this.seg(sessionKey)}:cancel`,
    );
  }
  startOnboarding(
    agentPath: string,
    sessionKey: string,
  ): Promise<SessionStartResponse> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentPath)}/sessions/onboarding`,
      { sessionKey },
    );
  }
  /**
   * `opts.observe` (default true) is consumed by the new-engine adapter, where
   * opening a chat also attaches a passive observer stream: bulk history reads
   * (mission search, board scans) pass `false` so N loads don't spawn N
   * streams. The Rust engine's WS delivers everything already — here the flag
   * is accepted for signature parity and ignored.
   */
  loadChatHistory(
    agentPath: string,
    sessionKey: string,
    _opts: { observe?: boolean } = {},
  ): Promise<ChatHistoryEntry[]> {
    return this.request(
      "GET",
      `/agents/${this.seg(agentPath)}/sessions/${this.seg(sessionKey)}/history`,
    );
  }
  summarizeActivity(
    message: string,
    opts: SummarizeOptions = {},
  ): Promise<SummarizeResult> {
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
    return this.request(
      "POST",
      `/routines/${this.seg(routineId)}/run-now`,
      undefined,
      {
        agentPath,
      },
    );
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
    return this.request("POST", "/routines/scheduler/start", undefined, {
      agentPath,
    });
  }
  stopRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/stop", undefined, {
      agentPath,
    });
  }
  syncRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/sync", undefined, {
      agentPath,
    });
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
    return this.request<{ installed: boolean }>(
      "GET",
      "/composio/cli-installed",
    ).then((r) => r.installed);
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
  /** Disconnect a toolkit: removes its connected account(s). */
  composioDisconnect(toolkit: string): Promise<void> {
    return this.request("POST", "/composio/connections/disconnect", {
      toolkit,
    });
  }
  /**
   * Reconnect a toolkit by refreshing its auth. Resolves to a browser URL
   * the user must open to complete OAuth re-consent, or `null` when the
   * auth scheme refreshed silently.
   */
  composioReconnect(toolkit: string): Promise<ComposioReconnectResponse> {
    return this.request("POST", "/composio/connections/reconnect", { toolkit });
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
    const res = await this.send(
      () => ({
        url: `${this.baseUrl}/v1/agents/portable/package?agentPath=${encodeURIComponent(
          agentPath,
        )}`,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req),
        },
      }),
      false, // heavy export POST — re-issue on the user's command, don't auto-replay
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
  status: number;
  body: ErrorBody | null;

  constructor(status: number, body: ErrorBody | null) {
    super(body?.error.message ?? `Engine error ${status}`);
    this.status = status;
    this.body = body;
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
