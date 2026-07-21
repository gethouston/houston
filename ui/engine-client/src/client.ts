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
  AddOrgMemberResult,
  Agent,
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentMoveStart,
  AgentMoveStatus,
  AgentSettings,
  ApiKey,
  ApiKeyCreated,
  AttachmentManifest,
  AttachmentUploadResult,
  AuditEntry,
  AvatarUploadResult,
  BillingCheckout,
  BillingSummary,
  Capabilities,
  ChatHistoryEntry,
  ClaudeStatus,
  CommunitySkill,
  CommunitySkillPreview,
  ComposioAppEntry,
  ComposioReconnectResponse,
  ComposioStartLinkResponse,
  ComposioStartLoginResponse,
  ComposioStatus,
  ComputeUsage,
  ConversationEntry,
  CreateAgent,
  CreateAgentResult,
  CreateAttachmentUploadsResponse,
  CreateSkillRequest,
  CreateWorkspace,
  CreateWorktreeRequest,
  CreatorAnalytics,
  CreatorProfile,
  CreatorProfilePatch,
  CustomEndpoint,
  CustomIntegrationView,
  ErrorBody,
  GenerateInstructionsResult,
  HandleAvailability,
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
  MyAgent,
  NewActivity,
  NewRoutine,
  OrgInfo,
  OrgRole,
  OrgSummary,
  OrgsList,
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
  ProviderUsage,
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
  SidebarLayout,
  SkillDetail,
  SkillSummary,
  StoreListing,
  StorePublicationStatus,
  StorePublishRequest,
  StorePublishResponse,
  StoreUnpublishResponse,
  StoreUpdateResponse,
  SummarizeOptions,
  SummarizeResult,
  TriggerStatusItem,
  TriggerType,
  TunnelCredentials,
  TunnelStatus,
  UpdateAgent,
  UpdateProvider,
  UsageRow,
  VersionResponse,
  WebhookKeyReveal,
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

/** The public store site (not API) base, for "browse the store" links. */
const STORE_SITE_URL = "https://agents.gethouston.ai";

/** The machine-local pointer the host keeps for a published agent (no secrets). */
interface StorePointer {
  storeAgentId: string;
  slug: string;
  shareUrl: string;
  publishedAt: string;
}

/** The subset of a `me/agents` item the manage view needs (wire contract). */
interface StoreMeAgentSummary {
  id: string;
  slug: string | null;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  state: string;
}

export class HoustonClient {
  // Mutable so the desktop supervisor can repoint us at a fresh
  // `{baseUrl, token}` when it restarts a crashed engine on a NEW random port
  // (HOU-432) — without every cached client reference going stale. In-flight
  // retries re-read these on each attempt, so they recover transparently.
  private baseUrl: string;
  private token: string;
  // Active hosted "space" (C8 §Active space). When non-null it is an org SLUG
  // (`[a-f0-9]{16}`, server-defined grammar) and EVERY HTTP request carries
  // `x-houston-org: <slug>` so the gateway resolves that team space. `null`
  // selects the caller's personal org — the gateway's header-absent default —
  // and sends NO header. Mutable like `{baseUrl, token}`: it's re-read per
  // request attempt (see `send`/`orgHeaders`), so a mid-flight switch is
  // honored on the next retry without rebuilding the client.
  private activeOrgSlug: string | null = null;
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

  /**
   * Pin (or clear) the active hosted space (C8 §Workspaces bridge). Pass an org
   * slug to act inside that team space — every request then carries
   * `x-houston-org: <slug>` — or `null` to fall back to the caller's personal
   * org (no header). Mirrors `setEndpoint`'s in-place mutation: in-flight
   * retries re-read it, so a switch takes effect on the next attempt without
   * rebuilding the client.
   *
   * The gateway is the sole authority — a slug the caller doesn't belong to
   * yields `403 not_member`. Because `role` is per-space, the caller MUST
   * re-fetch `capabilities()` after switching (C8 §capabilities); this method
   * only redirects the transport.
   */
  setActiveOrg(slug: string | null): void {
    this.activeOrgSlug = slug;
  }

  /**
   * The active-space header for one request, or `{}` when personal (`null`).
   * Called INSIDE each `build()` closure so it is evaluated per attempt — a
   * `setActiveOrg` mid-flight lands on the next retry, same discipline as the
   * live `token`/`baseUrl` re-read.
   */
  private orgHeaders(): Record<string, string> {
    return this.activeOrgSlug ? { "x-houston-org": this.activeOrgSlug } : {};
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
              ...this.orgHeaders(),
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
          ...this.orgHeaders(),
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

  // ---------- sidebar layout ----------

  getSidebarLayout(workspaceId: string): Promise<SidebarLayout> {
    return this.request(
      "GET",
      `/workspaces/${this.seg(workspaceId)}/sidebar-layout`,
    );
  }
  setSidebarLayout(
    workspaceId: string,
    layout: SidebarLayout,
  ): Promise<SidebarLayout> {
    return this.request(
      "PUT",
      `/workspaces/${this.seg(workspaceId)}/sidebar-layout`,
      layout,
    );
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
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...this.orgHeaders(),
          },
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
    _path?: string,
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
  // Marketplace reads carry the browsing agent's path: the hosted gateway only
  // proxies agent-scoped routes, so the adapter needs the scope. Against a
  // direct host this client reaches the same directory via the top-level
  // routes, so the path is unused here — the parameter is the wire contract.
  searchCommunitySkills(
    _agentPath: string,
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
  // Read-only detail for one community skill: fetches + parses its real
  // SKILL.md so the marketplace can show a true description before install.
  // Carries the browsing agent's path like the other reads (see above).
  previewCommunitySkill(
    _agentPath: string,
    source: string,
    skillId: string,
    signal?: AbortSignal,
  ): Promise<CommunitySkillPreview> {
    // Read-only preview POST → replay-safe.
    return this.request(
      "POST",
      "/skills/community/preview",
      { source, skillId },
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
    _agentPath: string,
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
  setPreference(key: string, value: string | null): Promise<void> {
    return this.request("PUT", `/preferences/${this.seg(key)}`, { value });
  }

  // ---------- providers ----------

  providerStatus(name: string): Promise<ProviderStatus> {
    return this.request("GET", `/providers/${this.seg(name)}/status`);
  }
  /**
   * Live per-account usage for every CONNECTED provider — rate-limit windows
   * (Claude 5h/weekly, Codex session/weekly, Copilot quotas) and prepaid
   * balances, fetched by the engine from each provider's own usage API. One
   * row per connected provider; a provider with no readable usage surface
   * answers an honest non-`ok` status rather than being omitted.
   */
  providerUsage(): Promise<ProviderUsage[]> {
    return this.request("GET", "/providers/usage");
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
  /**
   * Mint a relay credential so a local model server can be tunnelled to a CLOUD
   * agent (guided "connect a local model" flow). Hosted + new-engine only — the
   * legacy Rust engine has no gateway to issue one, and the UI is gated on the
   * `openaiCompatible` capability, so this is never hit here. Reject loudly
   * rather than pretend (no silent failure).
   */
  getTunnelCredentials(): Promise<TunnelCredentials | null> {
    return Promise.reject(
      new Error(
        "Connecting a local model to a cloud agent requires the new engine.",
      ),
    );
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
  /**
   * Begin connecting a toolkit's OAuth. Pass `agent` (the agent slug) when the
   * connect is initiated from a per-agent surface: the gateway then applies that
   * agent's effective allowlist and auto-grants the toolkit to the agent on a
   * successful connect (Teams v2). Omit it for the account-level Integrations
   * page. Single-player/self-host hosts ignore the field.
   */
  connectIntegration(
    provider: string,
    toolkit: string,
    agent?: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    return this.request("POST", `/integrations/${this.seg(provider)}/connect`, {
      toolkit,
      ...(agent ? { agent } : {}),
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

  // ---------- custom integrations (HOU-550) — v3 host only ----------
  //
  // User-added API / MCP servers not in the Composio catalog. The host owns
  // persistence; the frontend lists, removes, and provides a secret. The list
  // returns `null` when the host predates the feature (404) so all custom UI
  // hides, mirroring `agentActionApprovals`; every other error throws.

  /** All custom integrations, or `null` when the host does not support the
   *  feature (404 — old build / gateway-fronted pod). */
  async customIntegrations(): Promise<CustomIntegrationView[] | null> {
    try {
      return (
        await this.request<{ items: CustomIntegrationView[] }>(
          "GET",
          "/integrations/custom/definitions",
        )
      ).items;
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }
  /** Remove a custom integration entirely (executor + secret + definition). */
  async removeCustomIntegration(slug: string): Promise<void> {
    await this.request(
      "DELETE",
      `/integrations/custom/definitions/${this.seg(slug)}`,
    );
  }
  /**
   * Provide the secret for a `pending` custom integration. The host validates,
   * stores the secret out-of-band, connects, and returns the refreshed view.
   * The secret VALUE crosses only here (HTTPS body), never the chat transcript.
   */
  submitCustomIntegrationCredential(
    slug: string,
    values: Record<string, string>,
  ): Promise<CustomIntegrationView> {
    return this.request(
      "POST",
      `/integrations/custom/definitions/${this.seg(slug)}/credential`,
      { values },
    );
  }

  // ---------- triggers (C9 event-driven routines) ----------
  //
  // The catalog the routine editor's trigger picker reads, plus the per-routine
  // provisioning status it renders as a badge. Gated on `caps.triggers`; served
  // by the TS host (self-host) and by the cloud edge (managed). Off on desktop.

  /**
   * The trigger catalog for one toolkit (C9) — the events a routine can wake on.
   * Read-only GET, so it replays safely on a transient transport blip.
   */
  async triggerTypes(toolkit: string): Promise<TriggerType[]> {
    return (
      await this.request<{ items: TriggerType[] }>(
        "GET",
        "/integrations/composio/trigger-types",
        undefined,
        { toolkit },
      )
    ).items;
  }
  /**
   * One agent's per-routine trigger status (C9), or `null` when the host does
   * not serve triggers (404) — a deployment without event-driven routines (e.g.
   * desktop). Callers treat `null` as "triggers unsupported here" and hide the
   * badge; every other error still throws. Mirrors how `agentActionApprovals`
   * degrades on a 404.
   */
  async agentTriggerStatus(
    agentId: string,
  ): Promise<TriggerStatusItem[] | null> {
    try {
      return (
        await this.request<{ items: TriggerStatusItem[] }>(
          "GET",
          `/agents/${this.seg(agentId)}/trigger-status`,
        )
      ).items;
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Mint (or rotate) a routine's incoming-webhook key. Returns the one-time
   * reveal (`url` + `secret` + `key_prefix`), or `null` when the host does not
   * serve webhook keys (404) — a deployment without a webhook backend (e.g.
   * desktop/self-host). Calling again ROTATES: the old secret is invalidated.
   * Only the gateway serves this route; the TS host 404s it. Mirrors how
   * `agentTriggerStatus` degrades on a 404.
   */
  async mintRoutineWebhookKey(
    agentId: string,
    routineId: string,
  ): Promise<WebhookKeyReveal | null> {
    try {
      return await this.request<WebhookKeyReveal>(
        "POST",
        `/agents/${this.seg(agentId)}/routines/${this.seg(routineId)}/webhook-key`,
      );
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
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
  /**
   * Add a member by email at a role (owner only; enforced by the host). A known
   * Houston user is added directly; an unknown email creates a pending invite
   * instead (host answers `202 {invited:true,...}`). The parsed body is returned
   * so the caller can tell the two apart (`invited` / `userId`).
   */
  addOrgMember(email: string, role: OrgRole): Promise<AddOrgMemberResult> {
    return this.request("POST", "/org/members", { email, role });
  }
  /** Revoke a pending invite by id (owner only). */
  async deleteOrgInvite(inviteId: string): Promise<void> {
    await this.request("DELETE", `/org/invites/${this.seg(inviteId)}`);
  }
  /** Remove a member from the org. */
  async removeOrgMember(userId: string): Promise<void> {
    await this.request("DELETE", `/org/members/${this.seg(userId)}`);
  }
  /** Change a member's role. */
  async setOrgMemberRole(userId: string, role: OrgRole): Promise<void> {
    await this.request("PATCH", `/org/members/${this.seg(userId)}`, { role });
  }

  // ---------- spaces / teams (C8) — hosted gateway only ----------
  //
  // The caller's spaces list, self-serve team creation, and agent moves between
  // spaces. Gated on `caps.spaces`; the gateway is the sole enforcer. Kept here
  // for shim parity like the org methods above.

  /**
   * The caller's spaces + pending invites (C8 §Wire surface). Degrades to an
   * empty result on a host that predates spaces (404) — the switcher then shows
   * only the personal workspace, byte-identical to a pre-C8 deployment. Mirrors
   * how `getAgentModelChoice`/`agentActionApprovals` swallow a 404; every other
   * error throws.
   */
  async listOrgs(): Promise<OrgsList> {
    try {
      return await this.request<OrgsList>("GET", "/orgs");
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) {
        return { orgs: [], invites: [] };
      }
      throw err;
    }
  }
  /**
   * Create a team space (C8 §Wire surface). NOT idempotent — the gateway has no
   * dedup, so on a LOST response DON'T blind-retry: reconcile via `listOrgs` and
   * reuse the persisted slug. Never degrades — a failure must reach the UI, so it
   * throws the real `HoustonEngineError`. A POST, so `send` never auto-replays it.
   */
  createOrg(name: string): Promise<OrgSummary> {
    return this.request("POST", "/orgs", { name });
  }
  /**
   * Move an agent into a team space (C8 §Agent move). Returns the `moveId` to
   * poll with `getMoveStatus` to terminal `done` before inviting. Never degrades:
   * a `403 unsupported_move` / `409 unmovable_volume` / `403 needs_upgrade` must
   * surface, so it throws. A POST, so `send` never auto-replays it.
   */
  moveAgent(agentSlugOrId: string, toSlug: string): Promise<AgentMoveStart> {
    return this.request("POST", `/agents/${this.seg(agentSlugOrId)}/move`, {
      to: toSlug,
    });
  }
  /**
   * Poll one agent-move's progress (C8). The move-completion signal is THIS route
   * only — the event fan-in relays pod-scoped events and must not be relied on for
   * completion. A GET, so it replays safely on a transient transport blip.
   */
  getMoveStatus(
    agentSlugOrId: string,
    moveId: string,
  ): Promise<AgentMoveStatus> {
    return this.request(
      "GET",
      `/agents/${this.seg(agentSlugOrId)}/move/${this.seg(moveId)}`,
    );
  }

  // ---------- billing (C8) — hosted gateway only ----------
  //
  // Seat billing for the active team space. `getBilling` is a read the client
  // re-runs on every team-space entry (there is no push on expiry — status is a
  // DERIVED read); checkout/portal are owner-only writes that hand back a
  // Stripe-hosted URL.

  /**
   * The active team's billing summary (C8 §Billing wire surface). Owner/admin on
   * a team space only. Degrades to `null` for the NOT-ENTITLED cases — a gateway
   * that predates billing (404), a caller the gateway refuses billing detail
   * (403 `personal_space` on a personal space, or a plain member), and a
   * billing-off deployment (503, C8's feature-off-when-unset: no `GW_STRIPE_*`
   * configured — rollout Stage 1 and the kind loop run this way) — so the
   * billing UI renders nothing and the member/degrade surfaces take over.
   * Mirrors how `getAgentModelChoice` swallows a 404; every other error throws.
   *
   * `status` is the DERIVED effective status (never a stored column): `free`
   * (personal, enterprise-unbilled, or a solo team), `trialing` (2+ members, no
   * subscription, still inside the 14-day clock), `active` (subscribed or
   * enterprise), `past_due` (payment failed, still inside the 7-day grace),
   * `expired` (trial or grace elapsed — writes by non-owners then 403
   * `needs_upgrade`, surfaced to members as `OrgSummary.degraded`).
   */
  async getBilling(): Promise<BillingSummary | null> {
    try {
      return await this.request<BillingSummary>("GET", "/org/billing");
    } catch (err) {
      if (
        isHoustonEngineError(err) &&
        (err.status === 404 || err.status === 403 || err.status === 503)
      ) {
        return null;
      }
      throw err;
    }
  }
  /**
   * Start a Stripe Checkout session for the active team (owner only; the gateway
   * 403s `not_owner` for an admin). Returns the hosted `{url}` to open. Never
   * degrades — a failure must reach the UI, so it throws the real
   * `HoustonEngineError`.
   */
  createCheckout(interval: "monthly" | "annual"): Promise<BillingCheckout> {
    return this.request("POST", "/org/billing/checkout", { interval });
  }
  /**
   * Open the Stripe customer portal for the active team (owner only) — card,
   * invoices, interval switch, cancel. Returns the hosted `{url}`. Never degrades;
   * a failure throws so the UI surfaces the real reason.
   */
  createPortal(): Promise<BillingCheckout> {
    return this.request("POST", "/org/billing/portal", {});
  }

  // ---------- personal API keys (C9) — hosted gateway only ----------
  //
  // The user's programmatic credential for the public API. `listApiKeys` reads
  // the active keys (no secrets); `createApiKey` mints one and returns the FULL
  // secret exactly once; `revokeApiKey` soft-revokes by id. The frontend gates
  // the whole surface on `capabilities.apiKeys`, so off-gateway hosts never call
  // these.

  /**
   * The caller's active API keys, newest first (C9 §Routes). No secrets — each
   * entry carries only its display `prefix`. A GET, so it replays safely on a
   * transient transport blip.
   */
  listApiKeys(): Promise<ApiKey[]> {
    return this.request<{ keys: ApiKey[] }>("GET", "/keys").then((r) => r.keys);
  }
  /**
   * Mint a personal API key (C9). Returns the FULL secret in `key`, exposed ONLY
   * here and never retrievable again, so the caller reveals it once and keeps it
   * out of any cache. `name` is trimmed 1..100 server-side; ≥20 active keys →
   * `400 {code:"key_limit"}`, which the UI renders inline (revoke to free a
   * slot). A POST, so `send` never auto-replays it.
   */
  createApiKey(name: string): Promise<ApiKeyCreated> {
    return this.request("POST", "/keys", { name });
  }
  /**
   * Soft-revoke a key by id (C9). Idempotent from the user's view: an unknown,
   * foreign, or already-revoked id answers `404` (no existence leak). Returns
   * nothing on success (`204`).
   */
  revokeApiKey(id: string): Promise<void> {
    return this.request("DELETE", `/keys/${this.seg(id)}`);
  }

  // ---------- per-agent assignments (multiplayer) ----------

  /**
   * Set who may use this agent, and at what access level (Teams v2).
   *
   * Pass `AgentAssignment[]` (`{userId, access}`) to send the v2 body
   * `{assignments}` — the host set-replaces the roster and honors each
   * per-person `manager`/`user` level. Pass a plain `string[]` of user ids to
   * send the legacy body `{userIds}` (mapped to `access: "user"` server-side,
   * except users who already had `manager` keep it). An empty array takes the
   * legacy `{userIds: []}` path, preserving the old "empty = everyone" meaning.
   * Gate: owner any agent; admin only if agent-manager (enforced by the host).
   */
  async setAgentAssignments(
    agentSlugOrId: string,
    assignments: AgentAssignment[] | string[],
  ): Promise<void> {
    const isV2 = assignments.length > 0 && typeof assignments[0] !== "string";
    const body = isV2
      ? { assignments: assignments as AgentAssignment[] }
      : { userIds: assignments as string[] };
    await this.request(
      "PUT",
      `/agents/${this.seg(agentSlugOrId)}/assignments`,
      body,
    );
  }
  /**
   * Read this agent's Teams settings (any assigned caller or owner):
   * `allowedToolkits` (the agent's integration ceiling — the whole effective
   * allowlist, policy is per agent only) and the caller's effective `access`.
   */
  getAgentSettings(agentSlugOrId: string): Promise<AgentSettings> {
    return this.request("GET", `/agents/${this.seg(agentSlugOrId)}/settings`);
  }
  /**
   * Replace this agent's manager-set ceilings (agent-manager only). Pass
   * `allowedToolkits` (the integration ceiling: `null` = unrestricted, `[]` =
   * none — the host also prunes now-disallowed toolkits from existing grants so
   * revocation takes effect immediately) and/or `allowedModels` (the AI-model
   * ceiling: `null` = every model allowed, `[]` = none). Both fields are
   * optional so a caller can update one ceiling without touching the other.
   */
  async setAgentSettings(
    agentSlugOrId: string,
    settings: {
      allowedToolkits?: string[] | null;
      allowedModels?: string[] | null;
    },
  ): Promise<void> {
    await this.request(
      "PUT",
      `/agents/${this.seg(agentSlugOrId)}/settings`,
      settings,
    );
  }
  /**
   * Read the ACTING user's model choice for this agent plus the agent's
   * effective `allowedModels` ceiling (any assigned caller / owner). Returns
   * `null` when the host does not serve model choices (404) — a non-Teams host —
   * so the composer degrades to its single-player behavior; every other error
   * throws.
   */
  async getAgentModelChoice(
    agentSlugOrId: string,
  ): Promise<AgentModelChoiceInfo | null> {
    try {
      return await this.request<AgentModelChoiceInfo>(
        "GET",
        `/agents/${this.seg(agentSlugOrId)}/model-choice`,
      );
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }
  /**
   * Set the ACTING user's model choice for this agent (any assigned caller). The
   * gateway validates the model is within the agent's `allowedModels` ceiling
   * and answers `400 {code:"model_not_allowed"}` otherwise.
   */
  setAgentModelChoice(
    agentSlugOrId: string,
    choice: AgentModelChoice,
  ): Promise<void> {
    return this.request(
      "PUT",
      `/agents/${this.seg(agentSlugOrId)}/model-choice`,
      choice,
    );
  }
  /**
   * Read the org audit log, newest first (owner org-wide; admin filtered to
   * their managed agents; plain members 403). `before` pages by entry id,
   * `limit` caps the page (host clamps to ≤ 200).
   */
  async orgAudit(
    opts: { before?: number; limit?: number } = {},
  ): Promise<AuditEntry[]> {
    return (
      await this.request<{ entries: AuditEntry[] }>(
        "GET",
        "/org/audit",
        undefined,
        {
          before: opts.before?.toString(),
          limit: opts.limit?.toString(),
        },
      )
    ).entries;
  }
  /**
   * Read per-agent/user usage counters over the last `days` (owner org-wide;
   * admin their managed agents; plain members 403). Host clamps `days` to ≤ 90.
   */
  async orgUsage(days: number): Promise<UsageRow[]> {
    return (
      await this.request<{ rows: UsageRow[] }>("GET", "/org/usage", undefined, {
        days: days.toString(),
      })
    ).rows;
  }
  /**
   * Per-agent compute usage (engine running time) over the last `days`, scoped
   * server-side to the agents the caller can access. Only deployments that
   * advertise `capabilities.computeUsage` serve it. Host clamps `days` to ≤ 90.
   */
  async computeUsage(days: number): Promise<ComputeUsage> {
    return await this.request<ComputeUsage>(
      "GET",
      "/org/compute-usage",
      undefined,
      { days: days.toString() },
    );
  }
  // ---------- action approvals ----------

  /**
   * The actions this agent may run without asking again (the "always allow"
   * set). A host that does not serve the action-approval gate answers 404,
   * which degrades to `{ always: [] }`: the approval card only shows on hosts
   * that DO serve it, so an empty set is the correct "nothing pre-approved"
   * reading rather than a hard failure (a 404 → empty degrade).
   * Every other error still throws.
   */
  async agentActionApprovals(
    agentSlugOrId: string,
  ): Promise<{ always: string[] }> {
    try {
      return await this.request<{ always: string[] }>(
        "GET",
        `/agents/${this.seg(agentSlugOrId)}/action-approvals`,
      );
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404)
        return { always: [] };
      throw err;
    }
  }
  /** Add an action to this agent's "always allow" set; returns the new set. */
  async allowActionAlways(
    agentSlugOrId: string,
    action: string,
  ): Promise<{ always: string[] }> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/action-approvals/always`,
      { action },
    );
  }
  /**
   * Remove an action from this agent's "always allow" set (the review UI's
   * Remove); returns the new set. A mutation, so it does NOT degrade a 404 to a
   * fake empty result (unlike the GET) — a real failure must reach the user.
   */
  async disallowActionAlways(
    agentSlugOrId: string,
    action: string,
  ): Promise<{ always: string[] }> {
    return this.request(
      "DELETE",
      `/agents/${this.seg(agentSlugOrId)}/action-approvals/always`,
      { action },
    );
  }
  /** Approve one pending action once, by its `hash` (a single-use ticket). */
  async addActionApprovalTicket(
    agentSlugOrId: string,
    hash: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/action-approvals/tickets`,
      { hash },
    );
  }
  /**
   * Retire a conversation's pending interaction by appending a durable stop
   * marker (the stepper X / abandon). A runtime passthrough — like a real Stop,
   * the model learns nothing from it.
   */
  async dismissInteraction(
    agentSlugOrId: string,
    conversationId: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/conversations/${this.seg(conversationId)}/dismiss-interaction`,
    );
  }
  /**
   * Apply a Mode-pill switch to a conversation's EXECUTING turn (Claude Code's
   * shift+tab semantics): the running turn adopts the new mode at its next tool
   * decision. `applied: false` is benign — no turn was running, and the next
   * send pins the mode itself. A runtime passthrough via the host's channel
   * dispatch, like `dismissInteraction`.
   */
  setLiveTurnMode(
    agentSlugOrId: string,
    conversationId: string,
    mode: "execute" | "plan" | "auto",
  ): Promise<{ ok: boolean; applied: boolean }> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/conversations/${this.seg(conversationId)}/mode`,
      { mode },
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
            ...this.orgHeaders(),
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
  /**
   * Fetch a published agent from an Agent Store share link (or bare slug) and
   * park it for install, returning the SAME preview a file upload would. The
   * host resolves the link, validates the IR, and maps it to portable content
   * (SSRF-guarded); the parked package then flows through scan/install unchanged.
   */
  importFromStoreLink(url: string): Promise<PortableUploadPreviewResponse> {
    return this.request("POST", "/store/imports/from-link", { url });
  }
  importInstall(req: PortableInstallRequest): Promise<PortableInstalledAgent> {
    return this.request("POST", "/store/imports/install", req);
  }

  // ---------- Agent Store publication (account-based, no manage tokens) ----------
  //
  // The host gathers the IR (`portable/store-ir`) and records a token-free
  // pointer (`portable/store-publication`); the listing itself is created on the
  // gateway `/agentstore` API with the caller's own bearer. On a gateway-fronted
  // deployment the host and the store API share this `baseUrl`.

  private storeIrPath(agentPath: string): string {
    return `/agents/${encodeURIComponent(agentPath)}/portable/store-ir`;
  }
  private storePointerPath(agentPath: string): string {
    return `/agents/${encodeURIComponent(agentPath)}/portable/store-publication`;
  }
  private gatherStoreIr(
    agentPath: string,
    req: StorePublishRequest,
  ): Promise<{ ir: unknown }> {
    return this.request(
      "POST",
      this.storeIrPath(agentPath),
      req,
      undefined,
      undefined,
      false,
    );
  }

  /** Publish this agent to the Agent Store; returns the public share URL. A kept
   *  pointer re-publishes the SAME store agent so a re-publish never duplicates. */
  async publishAgentToStore(
    agentPath: string,
    req: StorePublishRequest,
  ): Promise<StorePublishResponse> {
    const { ir } = await this.gatherStoreIr(agentPath, req);
    const { pointer } = await this.request<{ pointer: StorePointer | null }>(
      "GET",
      this.storePointerPath(agentPath),
    );
    if (pointer) {
      await this.request(
        "PATCH",
        `/agentstore/agents/${encodeURIComponent(pointer.storeAgentId)}`,
        { ir, publish: true },
        undefined,
        undefined,
        false,
      );
      await this.request(
        "POST",
        this.storePointerPath(agentPath),
        pointer,
        undefined,
        undefined,
        false,
      );
      return {
        shareUrl: pointer.shareUrl,
        slug: pointer.slug,
        storeAgentId: pointer.storeAgentId,
      };
    }
    const created = await this.request<{
      agentId: string;
      slug: string;
      shareUrl: string;
    }>(
      "POST",
      "/agentstore/agents",
      { ir, publish: true },
      undefined,
      undefined,
      false,
    );
    const next: StorePointer = {
      storeAgentId: created.agentId,
      slug: created.slug,
      shareUrl: created.shareUrl,
      publishedAt: new Date().toISOString(),
    };
    await this.request(
      "POST",
      this.storePointerPath(agentPath),
      next,
      undefined,
      undefined,
      false,
    );
    return {
      shareUrl: created.shareUrl,
      slug: created.slug,
      storeAgentId: created.agentId,
    };
  }

  /** Re-publish an already-listed agent with a freshly gathered selection. */
  async updateStorePublication(
    agentPath: string,
    req: StorePublishRequest,
  ): Promise<StoreUpdateResponse> {
    const { pointer } = await this.request<{ pointer: StorePointer | null }>(
      "GET",
      this.storePointerPath(agentPath),
    );
    if (!pointer) throw new Error("This agent is not published.");
    const { ir } = await this.gatherStoreIr(agentPath, req);
    await this.request(
      "PATCH",
      `/agentstore/agents/${encodeURIComponent(pointer.storeAgentId)}`,
      { ir, identity: req.identity },
      undefined,
      undefined,
      false,
    );
    return { shareUrl: pointer.shareUrl, slug: pointer.slug };
  }

  /** Take the listing down; the pointer is kept so a re-publish reuses the agent. */
  async unpublishFromStore(agentPath: string): Promise<StoreUnpublishResponse> {
    const { pointer } = await this.request<{ pointer: StorePointer | null }>(
      "GET",
      this.storePointerPath(agentPath),
    );
    if (!pointer) return { ok: true };
    await this.request(
      "PATCH",
      `/agentstore/agents/${encodeURIComponent(pointer.storeAgentId)}`,
      { unpublish: true },
      undefined,
      undefined,
      false,
    );
    return { ok: true };
  }

  /** Whether this agent is linked to a listing, and its live state. */
  async getStorePublication(
    agentPath: string,
  ): Promise<StorePublicationStatus> {
    const { pointer } = await this.request<{ pointer: StorePointer | null }>(
      "GET",
      this.storePointerPath(agentPath),
    );
    if (!pointer) {
      return { published: false, linked: false, storeUrl: STORE_SITE_URL };
    }
    const { items } = await this.request<{ items: StoreMeAgentSummary[] }>(
      "GET",
      "/agentstore/me/agents",
    );
    const item = items.find((a) => a.id === pointer.storeAgentId);
    if (!item) {
      await this.request("DELETE", this.storePointerPath(agentPath));
      return { published: false, linked: false, storeUrl: STORE_SITE_URL };
    }
    return {
      published: item.state === "published",
      linked: true,
      storeAgentId: pointer.storeAgentId,
      slug: item.slug ?? pointer.slug,
      shareUrl: pointer.shareUrl,
      publishedAt: pointer.publishedAt,
      storeUrl: STORE_SITE_URL,
      identity: {
        name: item.name,
        description: item.description ?? "",
        ...(item.tagline ? { tagline: item.tagline } : {}),
        category: item.category ?? "",
        tags: item.tags ?? [],
      },
    };
  }

  // ---------- Agent Store owner management (the "my agents" panel) ----------
  //
  // Act on a listing by its gateway id against the `/agentstore` API with the
  // caller's own bearer (same surface the publish methods above use). Reads live
  // off `GET /me/agents`; no host-side pointer is involved.

  /** Every listing the caller owns, in all lifecycle states (`GET /me/agents`). */
  listMyStoreAgents(): Promise<MyAgent[]> {
    return this.request<{ items: MyAgent[] }>(
      "GET",
      "/agentstore/me/agents",
    ).then((r) => r.items);
  }
  /** Ask an admin to make an owned listing public (`PATCH … {requestPublic}`). */
  async requestStorePublic(storeAgentId: string): Promise<void> {
    await this.request(
      "PATCH",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
      { requestPublic: true },
      undefined,
      undefined,
      false,
    );
  }
  /** Drop a public listing back to unlisted (`PATCH … {visibility:"unlisted"}`). */
  async setStoreVisibilityUnlisted(storeAgentId: string): Promise<void> {
    await this.request(
      "PATCH",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
      { visibility: "unlisted" },
      undefined,
      undefined,
      false,
    );
  }
  /** Take an owned listing down by its gateway id (`PATCH … {unpublish}`). */
  async unpublishStoreAgentById(storeAgentId: string): Promise<void> {
    await this.request(
      "PATCH",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
      { unpublish: true },
      undefined,
      undefined,
      false,
    );
  }
  /** Soft-delete an owned listing by its gateway id (`DELETE /agents/{id}`). */
  async deleteStoreAgentById(storeAgentId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
    );
  }

  // ---------- Agent Store creator profile (the "publish as @handle" identity) ----------
  //
  // The caller's own creator profile, its handle claim + avatar, and their
  // per-day install analytics — all against the `/agentstore/me/*` gateway
  // routes with the caller's own bearer, exactly like the owner methods above.

  /** The caller's own creator profile, or `null` when never materialized. */
  async getMyStoreProfile(): Promise<CreatorProfile | null> {
    const { profile } = await this.request<{
      profile: CreatorProfile | null;
    }>("GET", "/agentstore/me/profile");
    return profile;
  }
  /** Upsert the caller's creator profile (`PATCH /me/profile`). */
  async updateMyStoreProfile(
    patch: CreatorProfilePatch,
  ): Promise<CreatorProfile> {
    const { profile } = await this.request<{ profile: CreatorProfile }>(
      "PATCH",
      "/agentstore/me/profile",
      patch,
      undefined,
      undefined,
      false,
    );
    return profile;
  }
  /** Whether a handle is claimable by the caller (`GET /handles/{handle}/available`). */
  checkStoreHandle(handle: string): Promise<HandleAvailability> {
    return this.request<HandleAvailability>(
      "GET",
      `/agentstore/handles/${this.seg(handle)}/available`,
    );
  }
  /** Replace the caller's avatar (`POST /me/avatar`, multipart field `file`). */
  uploadStoreAvatar(blob: Blob): Promise<AvatarUploadResult> {
    const form = new FormData();
    form.append("file", blob);
    // No `Content-Type`: `fetch` sets the multipart boundary from the FormData.
    return this.rawRequest<AvatarUploadResult>(
      "POST",
      "/agentstore/me/avatar",
      form,
    );
  }
  /** Clear the caller's avatar (`DELETE /me/avatar`). Idempotent. */
  async deleteStoreAvatar(): Promise<void> {
    await this.request("DELETE", "/agentstore/me/avatar");
  }
  /** Per-UTC-day install analytics over the caller's owned agents (`GET /me/analytics?days=`). */
  getMyStoreAnalytics(days?: number): Promise<CreatorAnalytics> {
    return this.request<CreatorAnalytics>(
      "GET",
      "/agentstore/me/analytics",
      undefined,
      { days: days !== undefined ? String(days) : undefined },
    );
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
    super(body?.error?.message ?? `Engine error ${status}`);
    this.status = status;
    this.body = body;
    this.name = "HoustonEngineError";
  }

  get code(): string | undefined {
    return this.body?.error?.code;
  }

  /**
   * Stable machine-readable tag set by the engine for typed errors
   * (e.g. `rate_limited`, `offline`, `already_installed`,
   * `repo_private`). UI matches on this to render plain-English copy
   * instead of parsing `message`. See `engine/houston-engine-core/src/skills.rs`
   * for the canonical kind list.
   */
  get kind(): string | undefined {
    const details = this.body?.error?.details;
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
