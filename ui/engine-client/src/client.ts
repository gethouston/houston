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
  AddCustomIntegrationInput,
  AddOrgMemberResult,
  Agent,
  AgentAssignment,
  AgentIdentityPatch,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentMoveStart,
  AgentMoveStatus,
  AgentSettings,
  AgentTeam,
  AgentTeamMember,
  AllConversationsResult,
  ApiKey,
  ApiKeyCreated,
  AssistantHandle,
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
  CustomDetectResult,
  CustomEndpoint,
  CustomIntegrationView,
  CustomToolInfo,
  EditableProfile,
  EditableProfileUpdate,
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
  MigrationImportOptions,
  MigrationImportResult,
  MyAgent,
  NewActivity,
  NewRoutine,
  OrgInfo,
  OrgPerson,
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
  SkillsManifest,
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
  UserProfilesResult,
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
   * Reconnect the app to the Houston engine at a new address.
   *
   * Point this client at a new engine endpoint in place. The desktop app
   * calls this when the supervisor respawns the engine on a fresh port so
   * requests already mid-flight (and every hook holding this instance)
   * recover on their next retry instead of hammering the dead port. See
   * `app/src/lib/engine.ts`.
   * @assistant group:system hidden
   */
  setEndpoint(opts: { baseUrl: string; token: string }): void {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
  }

  /**
   * Switch which workspace the app is acting inside.
   *
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
   * @assistant group:spaces hidden
   */
  setActiveOrg(slug: string | null): void {
    this.activeOrgSlug = slug;
  }

  /**
   * Note that the active workspace has no agent list to load.
   *
   * Tell the client the active space's agent list is not coming (boot resolved
   * no workspace to list agents for). Only the v3 host adapter acts on it — it
   * routes provider calls at a specific agent's runtime and would otherwise wait
   * on that list forever (HOU-979). This client addresses one runtime directly,
   * so there is nothing to settle.
   * @assistant group:system hidden
   */
  noteAgentsUnavailable(): void {}

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

  /**
   * Check that Houston is running.
   * @assistant group:system hidden
   */
  health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }
  /**
   * Read the version of Houston that is running.
   * @assistant group:system hidden
   */
  version(): Promise<VersionResponse> {
    return this.request("GET", "/version");
  }
  /**
   * Read which features this Houston deployment offers.
   * @assistant group:system hidden
   */
  capabilities(): Promise<Capabilities> {
    return this.request("GET", "/capabilities");
  }

  // ---------- personal assistant ----------

  /**
   * Find the user's personal assistant.
   *
   * Answers WHICH agent holds it and WHICH conversation to open; the chat
   * itself then rides the ordinary per-agent calls, because the assistant IS an
   * agent — a hidden one this deployment creates on the first ask. Both fields
   * are opaque addresses: pass them through, never parse them. A deployment
   * that hosts no assistant answers 501.
   *
   * Plumbing, not an operation the assistant performs on itself: `hidden`.
   * @assistant group:system hidden
   */
  getAssistant(): Promise<AssistantHandle> {
    return this.request("GET", "/assistant");
  }

  // ---------- workspaces ----------

  /**
   * List the workspaces in Houston.
   * @assistant group:workspaces
   */
  listWorkspaces(): Promise<Workspace[]> {
    return this.request("GET", "/workspaces");
  }
  /**
   * Create a workspace.
   * @assistant group:workspaces
   */
  createWorkspace(req: CreateWorkspace): Promise<Workspace> {
    return this.request("POST", "/workspaces", req);
  }
  /**
   * Rename a workspace.
   * @assistant group:workspaces
   */
  renameWorkspace(id: string, req: RenameWorkspace): Promise<Workspace> {
    return this.request("POST", `/workspaces/${this.seg(id)}/rename`, req);
  }
  /**
   * Permanently delete a workspace and its contents.
   * @assistant group:workspaces confirm
   */
  deleteWorkspace(id: string): Promise<void> {
    return this.request("DELETE", `/workspaces/${this.seg(id)}`);
  }
  /**
   * Choose the language a workspace's interface is shown in.
   *
   * Set (or clear) a workspace's UI-locale override. Pass `null` to clear it
   * so the workspace falls back to the global `locale` preference. Persisted on
   * the workspace record, so every client of this engine shares the value.
   * @assistant group:workspaces
   */
  setWorkspaceLocale(id: string, locale: string | null): Promise<Workspace> {
    // The host's workspace-settings route is `PATCH /workspaces/:id` (locale is
    // the one mutable field); a `/locale` suffix 404s, so the pick never lands.
    return this.request("PATCH", `/workspaces/${this.seg(id)}`, {
      locale,
    });
  }
  /**
   * Choose which AI provider a workspace uses.
   * @assistant group:workspaces
   */
  setWorkspaceProvider(id: string, req: UpdateProvider): Promise<Workspace> {
    return this.request("PATCH", `/workspaces/${this.seg(id)}/provider`, req);
  }
  /**
   * Set up a workspace from a GitHub repository.
   * @assistant group:workspaces confirm
   */
  installWorkspaceFromGithub(
    req: InstallFromGithub,
  ): Promise<ImportedWorkspace> {
    return this.request("POST", "/workspaces/install-from-github", req);
  }
  /**
   * Read the shared background notes of a workspace.
   * @assistant group:workspaces
   */
  getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    return this.request("GET", `/workspaces/${this.seg(id)}/context`);
  }
  /**
   * Replace the shared background notes of a workspace.
   * @assistant group:workspaces
   */
  setWorkspaceContext(
    id: string,
    body: WorkspaceContext,
  ): Promise<WorkspaceContext> {
    return this.request("PUT", `/workspaces/${this.seg(id)}/context`, body);
  }

  // ---------- sidebar layout ----------

  /**
   * Read how a workspace's sidebar is arranged.
   * @assistant group:settings
   */
  getSidebarLayout(workspaceId: string): Promise<SidebarLayout> {
    return this.request(
      "GET",
      `/workspaces/${this.seg(workspaceId)}/sidebar-layout`,
    );
  }
  /**
   * Save how a workspace's sidebar is arranged.
   * @assistant group:settings
   */
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

  /**
   * List the agents in a workspace.
   * @assistant group:agents
   */
  listAgents(workspaceId: string): Promise<Agent[]> {
    return this.request("GET", `/workspaces/${this.seg(workspaceId)}/agents`);
  }
  /**
   * Create an agent in a workspace.
   * @assistant group:agents
   */
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
  /**
   * Permanently delete an agent and everything it holds.
   * @assistant group:agents confirm
   */
  deleteAgent(workspaceId: string, agentId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/workspaces/${this.seg(workspaceId)}/agents/${this.seg(agentId)}`,
    );
  }
  /**
   * Rename an agent.
   * @assistant group:agents
   */
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
  /**
   * Change an agent's details, such as its name or instructions.
   * @assistant group:agents
   */
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

  /**
   * Read one of an agent's saved data files.
   * @assistant group:files
   */
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
  /**
   * Replace the contents of one of an agent's saved data files.
   * @assistant group:files
   */
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
  /**
   * Put the standard data templates in place for an agent.
   * @assistant group:files hidden
   */
  seedAgentSchemas(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/seed-schemas", {
      agent_path: agentPath,
    });
  }
  /**
   * Bring an agent's saved data up to the current layout.
   * @assistant group:files hidden
   */
  migrateAgentFiles(agentPath: string): Promise<void> {
    return this.request("POST", "/agents/files/migrate", {
      agent_path: agentPath,
    });
  }

  // ---------- project files (browser) ----------

  /**
   * List the files in an agent's folder.
   * @assistant group:files
   */
  listProjectFiles(agentPath: string): Promise<ProjectFile[]> {
    return this.request("GET", "/agents/files", undefined, {
      agent_path: agentPath,
    });
  }
  /**
   * Read a file from an agent's folder.
   * @assistant group:files
   */
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
  /**
   * Download a file from an agent's folder.
   *
   * Raw bytes of a project file (binary-safe) plus its served MIME type.
   * @assistant group:files
   */
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
  /**
   * Rename a file in an agent's folder.
   * @assistant group:files
   */
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
  /**
   * Permanently delete a file from an agent's folder.
   * @assistant group:files confirm
   */
  deleteFile(agentPath: string, relPath: string): Promise<void> {
    return this.request("DELETE", "/agents/files", undefined, {
      agent_path: agentPath,
      rel_path: relPath,
    });
  }
  /**
   * Create a folder in an agent's folder.
   * @assistant group:files
   */
  createFolder(
    agentPath: string,
    folderName: string,
  ): Promise<{ created: string }> {
    return this.request("POST", "/agents/files/folder", {
      agent_path: agentPath,
      folder_name: folderName,
    });
  }
  /**
   * Copy files from this computer into an agent's folder.
   * @assistant group:files
   */
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
  /**
   * Add a file to an agent's folder from its contents.
   * @assistant group:files
   */
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
  /**
   * Upload files from the user's device into an agent's folder.
   *
   * Upload browser Files into the agent's workspace (file-browser drag-drop /
   * Browse). This engine's import route takes one file per request and has no
   * target-folder or relPath parameter, so uploads land flat at the workspace
   * root (the file browser hides the folder-upload affordance on this
   * engine).
   * @assistant group:files hidden
   */
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
  /**
   * Move a file into another folder of an agent's folder.
   *
   * This engine has no move route; the file browser only offers drag-move on
   * the TS host. Refuse loudly rather than pretend the file moved.
   * @assistant group:files
   */
  async moveProjectFile(
    _agentPath: string,
    _relPath: string,
    _toDir: string | null,
  ): Promise<void> {
    throw new Error("Moving files is not supported on this engine.");
  }
  /**
   * Download everything in an agent's folder as one archive.
   *
   * This engine has no archive route ("Download all" is a TS-host feature);
   * it is never offered in the UI here, so refuse loudly if reached.
   * @assistant group:files
   */
  async downloadProjectArchive(
    _agentPath: string,
    _path?: string,
  ): Promise<{ blob: Blob; contentType: string }> {
    throw new Error("Downloading all files is not supported on this engine.");
  }

  // ---------- agents: activities ----------

  /**
   * List the missions assigned to an agent.
   * @assistant group:missions
   */
  listActivities(agentPath: string): Promise<Activity[]> {
    return this.request("GET", "/agents/activities", undefined, {
      agent_path: agentPath,
    });
  }
  /**
   * Create a mission for an agent.
   * @assistant group:missions
   */
  createActivity(agentPath: string, input: NewActivity): Promise<Activity> {
    return this.request("POST", "/agents/activities", input, {
      agent_path: agentPath,
    });
  }
  /**
   * Update a mission's details or status.
   * @assistant group:missions
   */
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
  /**
   * Permanently delete a mission.
   * @assistant group:missions confirm
   */
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

  /**
   * List an agent's routines.
   * @assistant group:routines
   */
  listRoutines(agentPath: string): Promise<Routine[]> {
    return this.request("GET", "/routines", undefined, { agentPath });
  }
  /**
   * Create a routine for an agent.
   * @assistant group:routines
   */
  createRoutine(agentPath: string, input: NewRoutine): Promise<Routine> {
    return this.request("POST", "/routines", input, { agentPath });
  }
  /**
   * Update a routine's schedule or instructions.
   * @assistant group:routines
   */
  updateRoutine(
    agentPath: string,
    id: string,
    updates: RoutineUpdate,
  ): Promise<Routine> {
    return this.request("PATCH", `/routines/${this.seg(id)}`, updates, {
      agentPath,
    });
  }
  /**
   * Permanently delete a routine.
   * @assistant group:routines confirm
   */
  deleteRoutine(agentPath: string, id: string): Promise<void> {
    return this.request("DELETE", `/routines/${this.seg(id)}`, undefined, {
      agentPath,
    });
  }

  // ---------- routine runs ----------

  /**
   * List routine runs, optionally for one routine.
   * @assistant group:routines
   */
  listRoutineRuns(
    agentPath: string,
    routineId?: string,
  ): Promise<RoutineRun[]> {
    return this.request("GET", "/routine-runs", undefined, {
      agentPath,
      routineId,
    });
  }
  /**
   * Create a run record for a routine.
   * @assistant group:routines
   */
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
  /**
   * Update the status or details of a routine run.
   * @assistant group:routines
   */
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

  /**
   * Read an agent's configuration.
   * @assistant group:agents
   */
  getAgentConfig(agentPath: string): Promise<ProjectConfig> {
    return this.request("GET", "/agents/config", undefined, {
      agent_path: agentPath,
    });
  }
  /**
   * Replace an agent's configuration.
   * @assistant group:agents
   */
  setAgentConfig(
    agentPath: string,
    config: ProjectConfig,
  ): Promise<ProjectConfig> {
    return this.request("PUT", "/agents/config", config, {
      agent_path: agentPath,
    });
  }

  // ---------- agent configs (installed manifests) ----------

  /**
   * List the agent templates installed in Houston.
   * @assistant group:agents
   */
  listInstalledConfigs(): Promise<InstalledConfig[]> {
    return this.request("GET", "/agent-configs");
  }

  // ---------- conversations ----------

  /**
   * List an agent's conversations.
   * @assistant group:chat
   */
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
  /**
   * List the conversations of several agents at once.
   * @assistant group:chat
   */
  async listAllConversations(
    agentPaths: string[],
  ): Promise<AllConversationsResult> {
    // Read-only POST → replay-safe. ONE request sweeps every agent server-side,
    // so the answer is all-or-nothing: it either throws or is complete. Only a
    // client-side fan-out (the hosted adapter) can come back partial, hence the
    // always-empty `failedAgents`.
    const conversations = await this.request<ConversationEntry[]>(
      "POST",
      "/conversations/list-all",
      { agentPaths },
      undefined,
      undefined,
      true,
    );
    return { conversations, failedAgents: [] };
  }

  // ---------- skills ----------

  /**
   * List the skills available in a workspace.
   * @assistant group:skills
   */
  listSkills(workspacePath: string): Promise<SkillSummary[]> {
    return this.request("GET", "/skills", undefined, { workspacePath });
  }
  /**
   * Read a skill's instructions.
   * @assistant group:skills
   */
  loadSkill(workspacePath: string, name: string): Promise<SkillDetail> {
    return this.request("GET", `/skills/${this.seg(name)}`, undefined, {
      workspacePath,
    });
  }
  /**
   * Create a skill.
   * @assistant group:skills
   */
  createSkill(req: CreateSkillRequest): Promise<void> {
    return this.request("POST", "/skills", req);
  }
  /**
   * Save changes to a skill.
   * @assistant group:skills
   */
  saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
    return this.request("PUT", `/skills/${this.seg(name)}`, req);
  }
  /**
   * Permanently delete a skill.
   * @assistant group:skills confirm
   */
  deleteSkill(workspacePath: string, name: string): Promise<void> {
    return this.request("DELETE", `/skills/${this.seg(name)}`, undefined, {
      workspacePath,
    });
  }
  /**
   * List the skills shared with the whole workspace.
   * @assistant group:skills
   */
  listSharedSkills(workspaceId: string): Promise<{
    items: SkillSummary[];
    diagnostics: { key: string; message: string }[];
  }> {
    return this.request(
      "GET",
      `/workspaces/${this.seg(workspaceId)}/shared-skills`,
    );
  }
  /**
   * Read the instructions of a skill shared with the workspace.
   * @assistant group:skills
   */
  loadSharedSkill(workspaceId: string, slug: string): Promise<SkillDetail> {
    return this.request(
      "GET",
      `/workspaces/${this.seg(workspaceId)}/shared-skills/${this.seg(slug)}`,
    );
  }
  /**
   * Create a skill and share it with the whole workspace.
   * @assistant group:skills confirm
   */
  createSharedSkill(
    workspaceId: string,
    req: CreateSkillRequest,
  ): Promise<SkillDetail> {
    return this.request(
      "POST",
      `/workspaces/${this.seg(workspaceId)}/shared-skills`,
      req,
    );
  }
  /**
   * Share an existing skill with the whole workspace.
   *
   * Place a FULL existing SKILL.md at an exact slug ("Share to workspace").
   * @assistant group:skills confirm
   */
  promoteSharedSkill(
    workspaceId: string,
    slug: string,
    content: string,
  ): Promise<SkillDetail> {
    return this.request(
      "POST",
      `/workspaces/${this.seg(workspaceId)}/shared-skills/${this.seg(slug)}`,
      { content },
    );
  }
  /**
   * Save changes to a skill shared with the workspace.
   * @assistant group:skills
   */
  saveSharedSkill(
    workspaceId: string,
    slug: string,
    req: SaveSkillRequest,
  ): Promise<void> {
    return this.request(
      "PUT",
      `/workspaces/${this.seg(workspaceId)}/shared-skills/${this.seg(slug)}`,
      req,
    );
  }
  /**
   * Permanently delete a skill shared with the workspace.
   * @assistant group:skills confirm
   */
  deleteSharedSkill(workspaceId: string, slug: string): Promise<void> {
    return this.request(
      "DELETE",
      `/workspaces/${this.seg(workspaceId)}/shared-skills/${this.seg(slug)}`,
    );
  }
  /**
   * Read which skills an agent has switched on.
   * @assistant group:skills
   */
  getSkillsManifest(agentPath: string): Promise<SkillsManifest> {
    return this.request("GET", "/skills-manifest", undefined, {
      workspacePath: agentPath,
    });
  }
  /**
   * Choose which skills an agent has switched on.
   * @assistant group:skills
   */
  putSkillsManifest(
    agentPath: string,
    manifest: SkillsManifest,
  ): Promise<SkillsManifest> {
    return this.request("PUT", "/skills-manifest", manifest, {
      workspacePath: agentPath,
    });
  }
  // Marketplace reads carry the browsing agent's path: the hosted gateway only
  // proxies agent-scoped routes, so the adapter needs the scope. Against a
  // direct host this client reaches the same directory via the top-level
  // routes, so the path is unused here — the parameter is the wire contract.
  /**
   * Search the community directory of skills.
   * @assistant group:skills
   */
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
  /**
   * Preview what a community skill does before installing it.
   * @assistant group:skills
   */
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
  /**
   * Install a skill from the community directory.
   * @assistant group:skills confirm
   */
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
  /**
   * List the skills published in a GitHub repository.
   * @assistant group:skills
   */
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
  /**
   * Install skills from a GitHub repository.
   * @assistant group:skills confirm
   */
  installSkillsFromRepo(
    req: InstallFromRepoRequest,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.request("POST", "/skills/repo/install", req, undefined, signal);
  }

  // ---------- preferences ----------

  /**
   * Read one of the user's saved preferences.
   * @assistant group:settings
   */
  getPreference(key: string): Promise<string | null> {
    return this.request<PreferenceValue>(
      "GET",
      `/preferences/${this.seg(key)}`,
    ).then((r) => r.value);
  }
  /**
   * Change one of the user's saved preferences.
   * @assistant group:settings
   */
  setPreference(key: string, value: string | null): Promise<void> {
    return this.request("PUT", `/preferences/${this.seg(key)}`, { value });
  }

  // ---------- providers ----------

  /**
   * Check whether an AI provider is connected.
   * @assistant group:providers
   */
  providerStatus(name: string): Promise<ProviderStatus> {
    return this.request("GET", `/providers/${this.seg(name)}/status`);
  }
  /**
   * Check which AI providers an agent can use.
   * @assistant group:providers
   */
  providerStatusesForAgent(
    _agentId: string,
    names: readonly string[],
  ): Promise<ProviderStatus[]> {
    return Promise.all(names.map((name) => this.providerStatus(name)));
  }
  /**
   * See how much of each connected AI provider's allowance is left.
   *
   * Live per-account usage for every CONNECTED provider — rate-limit windows
   * (Claude 5h/weekly, Codex session/weekly, Copilot quotas) and prepaid
   * balances, fetched by the engine from each provider's own usage API. One
   * row per connected provider; a provider with no readable usage surface
   * answers an honest non-`ok` status rather than being omitted.
   * @assistant group:providers
   */
  providerUsage(): Promise<ProviderUsage[]> {
    return this.request("GET", "/providers/usage");
  }
  /**
   * Start signing in to an AI provider.
   *
   * Launch the provider's CLI login. `opts.deviceAuth` requests the
   * provider's headless device-code flow (OpenAI/codex `--device-auth`)
   * for remote engines that can't receive the CLI's `localhost` OAuth
   * callback. It's ignored by providers without a device flow, and the
   * co-located desktop app omits it to keep the browser-loopback login.
   *
   * `opts.enterpriseDomain` (GitHub Copilot Enterprise) only matters on the
   * new TS engine, where the control-plane adapter overrides this method; the
   * legacy Rust path has no Copilot provider, so it's passed through harmlessly.
   * @assistant group:providers
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
  /**
   * Sign out of an AI provider.
   * @assistant group:providers confirm
   */
  providerLogout(name: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/logout`);
  }
  /**
   * Finish an AI provider sign-in with the code from the browser.
   *
   * Submit the OAuth verification code the user pasted from their
   * browser. Required for remote/headless engines (container,
   * Always-On VPS, future Cloud) where the CLI can't open the user's
   * browser itself: the engine surfaces the sign-in URL via the WS
   * `ProviderLoginUrl` event, the UI displays it + a paste-code
   * input, and this call writes the code back to the CLI's stdin so
   * it can exchange for an OAuth token. The engine emits
   * `ProviderLoginComplete` when the CLI exits.
   * @assistant group:providers hidden
   */
  submitProviderLoginCode(name: string, code: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/login/code`, {
      code,
    });
  }
  /**
   * Cancel an AI provider sign-in that is still in progress.
   *
   * Abort an in-flight browser sign-in. The engine kills the provider
   * CLI subprocess and frees the in-flight slot so a follow-up
   * `providerLogin` isn't rejected as "already pending". Use this when
   * the user gives up on the OAuth tab (closed the browser, stuck
   * spinner): without it they'd be stuck until the 10-min relay
   * timeout. Idempotent — cancelling with nothing pending is a no-op.
   * The engine emits a benign `ProviderLoginComplete` (`success:
   * false`, no `error`) so subscribers clear their pending state
   * without showing an error toast.
   * @assistant group:providers
   */
  cancelProviderLogin(name: string): Promise<void> {
    return this.request("POST", `/providers/${this.seg(name)}/login/cancel`);
  }
  /**
   * Connect Gemini with an API key.
   *
   * Persist a Gemini API key to `~/.gemini/.env`. The engine validates
   * the key shape, writes atomically, and chmods 0600 on Unix. The
   * next `providerStatus("gemini")` poll will return `Authenticated`
   * without requiring a Houston restart.
   *
   * Gemini-specific: other providers use the CLI's own OAuth flow via
   * `providerLogin`. Do NOT generalize this route until a second
   * provider needs it.
   * @assistant group:providers hidden
   */
  setGeminiApiKey(apiKey: string): Promise<void> {
    return this.request("POST", "/providers/gemini/credentials", { apiKey });
  }
  /**
   * Connect an AI provider with an API key.
   *
   * Connect an API-key provider (OpenCode Zen / Go) by submitting a pasted key.
   * Only the new TS engine serves these providers; the UI gates the call behind
   * `newEngineActive()`, so on the legacy Rust engine this route is never hit.
   * @assistant group:providers hidden
   */
  setProviderApiKey(
    name: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void> {
    // The legacy Rust engine has no Azure support; `endpoint` is declared for
    // shim parity with the v3 adapter and never reaches this engine usefully.
    return this.request("POST", `/providers/${this.seg(name)}/api-key`, {
      apiKey,
      ...(endpoint ? { endpoint } : {}),
    });
  }
  /**
   * Send this computer's Anthropic sign-in to a cloud agent.
   *
   * Push a desktop-minted Anthropic OAuth credential to the acting space's agent
   * pod.
   *
   * The v3 host adapter is the real implementation — a remote pod cannot read this
   * machine's Keychain, so only a cloud deployment needs the push. The legacy Rust
   * engine is always CO-LOCATED with its credential dir and has no such route, so
   * reject loudly rather than pretend to succeed (no silent failure). Declared
   * here so the shared app typechecks against both clients (shim parity).
   * @assistant group:providers hidden
   */
  pushClaudeOAuthCredential(_credentialJson: string): Promise<void> {
    return Promise.reject(
      new Error("Pushing a Claude credential requires the new engine."),
    );
  }
  /**
   * Connect a local or custom AI model server.
   *
   * Connect an OpenAI-compatible (local) server by base URL + model. The legacy
   * Rust engine has no such provider — it's new-engine + desktop only, and the
   * connect UI is gated on `newEngineActive()` + desktop, so this is never hit
   * here. Reject loudly rather than pretend to succeed (no silent failure).
   * @assistant group:providers
   */
  setProviderCustomEndpoint(_endpoint: CustomEndpoint): Promise<void> {
    return Promise.reject(new Error("Local models require the new engine."));
  }
  /**
   * Get the credentials that link a local AI model to a cloud agent.
   *
   * Mint a relay credential so a local model server can be tunnelled to a CLOUD
   * agent (guided "connect a local model" flow). Hosted + new-engine only — the
   * legacy Rust engine has no gateway to issue one, and the UI is gated on the
   * `openaiCompatible` capability, so this is never hit here. Reject loudly
   * rather than pretend (no silent failure).
   * @assistant group:providers hidden
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

  /**
   * See which apps can be connected and which already are.
   * @assistant group:integrations
   */
  async integrationStatus(): Promise<IntegrationProviderStatus[]> {
    return (
      await this.request<{ items: IntegrationProviderStatus[] }>(
        "GET",
        "/integrations",
      )
    ).items;
  }
  /**
   * Keep the app-connection session signed in.
   *
   * Keep the desktop gateway's Supabase session fresh (null on sign-out).
   * @assistant group:integrations hidden
   */
  async setIntegrationSession(token: string | null): Promise<void> {
    await this.request("PUT", "/integrations/session", { token });
  }
  /**
   * List the apps available to connect.
   * @assistant group:integrations
   */
  async integrationToolkits(provider: string): Promise<IntegrationToolkit[]> {
    return (
      await this.request<{ items: IntegrationToolkit[] }>(
        "GET",
        `/integrations/${this.seg(provider)}/toolkits`,
      )
    ).items;
  }
  /**
   * List the accounts connected for an app.
   * @assistant group:integrations
   */
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
   * Connect one of the user's app accounts, such as Gmail or Slack.
   *
   * Begin connecting a toolkit's OAuth. Pass `agent` (the agent slug) when the
   * connect is initiated from a per-agent surface: the gateway then applies that
   * agent's effective allowlist and auto-grants the toolkit to the agent on a
   * successful connect (Teams v2). Omit it for the account-level Integrations
   * page. Single-player/self-host hosts ignore the field.
   * @assistant group:integrations confirm
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
  /**
   * Check whether an app connection has finished.
   *
   * Poll one connection after connect() until the OAuth finishes.
   * @assistant group:integrations
   */
  integrationConnection(
    provider: string,
    connectionId: string,
  ): Promise<IntegrationConnection> {
    return this.request(
      "GET",
      `/integrations/${this.seg(provider)}/connections/${this.seg(connectionId)}`,
    );
  }
  /**
   * Disconnect a connected app account.
   *
   * `connectionId` narrows the removal to ONE account of the toolkit (a
   * toolkit can hold several — two Gmail logins); omitted removes them all.
   * @assistant group:integrations confirm
   */
  async disconnectIntegration(
    provider: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/integrations/${this.seg(provider)}/disconnect`,
      { toolkit, ...(connectionId ? { connectionId } : {}) },
    );
  }
  /**
   * Dismiss the notice asking the user to reconnect their apps.
   *
   * Dismiss the "reconnect your apps" notice by deleting the legacy
   * credentials server-side; afterwards `integrationStatus()` reports no
   * `reconnect` flag.
   * @assistant group:integrations hidden
   */
  async dismissIntegrationsReconnectNotice(): Promise<void> {
    await this.request("POST", "/integrations/reconnect-notice/dismiss");
  }

  // ---------- custom integrations (HOU-550) — v3 host only ----------
  //
  // User-added API / MCP servers not in the Composio catalog. The host owns
  // persistence; the frontend lists, removes, and provides a secret. The list
  // returns `null` when the host predates the feature (404) so all custom UI
  // hides, mirroring `getAgentModelChoice`; every other error throws.

  /**
   * List the apps the user added themselves.
   *
   * All custom integrations, or `null` when the host does not support the
   * feature (404 — old build / gateway-fronted pod).
   * @assistant group:integrations
   */
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
  /**
   * Remove an app the user added themselves.
   *
   * Remove a custom integration entirely (executor + secret + definition).
   * @assistant group:integrations confirm
   */
  async removeCustomIntegration(slug: string): Promise<void> {
    await this.request(
      "DELETE",
      `/integrations/custom/definitions/${this.seg(slug)}`,
    );
  }
  /**
   * Provide the secret that finishes setting up a user-added app.
   *
   * Provide the secret for a `pending` custom integration. The host validates,
   * stores the secret out-of-band, connects, and returns the refreshed view.
   * The secret VALUE crosses only here (HTTPS body), never the chat transcript.
   * @assistant group:integrations hidden
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
  /**
   * List the user-added apps available to one agent.
   *
   * The custom-integration list through the per-agent surface — the ONE form a
   * gateway-fronted deployment proxies to the agent's pod (the gateway's own
   * `/v1/integrations` subtree is Composio-only, so the top-level form 404s
   * there — HOU-823). The list is user-global; the agent id authorizes and
   * routes. `null` on 404, mirroring `customIntegrations`.
   * @assistant group:integrations
   */
  async agentCustomIntegrations(
    agentSlugOrId: string,
  ): Promise<CustomIntegrationView[] | null> {
    try {
      return (
        await this.request<{ items: CustomIntegrationView[] }>(
          "GET",
          `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions`,
        )
      ).items;
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }
  /**
   * Provide the secret that finishes setting up a user-added app for one agent.
   *
   * Provide the secret through the per-agent surface (see
   * `agentCustomIntegrations`) — what the in-chat credential card calls, so
   * the save reaches the agent's pod on a gateway-fronted deployment instead
   * of 404ing at the gateway (HOU-823). Same contract as
   * `submitCustomIntegrationCredential` otherwise.
   * @assistant group:integrations hidden
   */
  submitAgentCustomIntegrationCredential(
    agentSlugOrId: string,
    slug: string,
    values: Record<string, string>,
  ): Promise<CustomIntegrationView> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions/${this.seg(slug)}/credential`,
      { values },
    );
  }
  /**
   * Start the browser sign-in for a user-added app.
   *
   * Start the browser sign-in for an OAuth custom integration (PRODUCT-1172):
   * the host discovers the service's authorization server, registers, and
   * returns the authorize URL to open in the browser. Completion lands on the
   * host's public callback; the refreshed list arrives via
   * `CustomIntegrationsChanged`.
   * @assistant group:integrations confirm
   */
  startCustomIntegrationOAuth(slug: string): Promise<{ authorizeUrl: string }> {
    return this.request(
      "POST",
      `/integrations/custom/definitions/${this.seg(slug)}/oauth/start`,
    );
  }
  /**
   * Start the browser sign-in for one agent's user-added app.
   *
   * `startCustomIntegrationOAuth` through the per-agent surface (the ONE
   * form a gateway-fronted deployment proxies to the pod — HOU-823).
   * @assistant group:integrations confirm
   */
  startAgentCustomIntegrationOAuth(
    agentSlugOrId: string,
    slug: string,
  ): Promise<{ authorizeUrl: string }> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions/${this.seg(slug)}/oauth/start`,
    );
  }
  /**
   * Check what kind of service a pasted link points to.
   *
   * Classify a pasted URL (OpenAPI doc / MCP endpoint / unknown) — the manual
   * add form's pre-check (HOU-980). `unknown` is a result, never a throw.
   * @assistant group:integrations
   */
  detectCustomIntegration(url: string): Promise<CustomDetectResult> {
    return this.request("POST", "/integrations/custom/detect", { url });
  }
  /**
   * Add an app of the user's own from a link.
   *
   * Register a custom integration from the manual add form. The host compiles
   * it before persisting; a compile failure rejects with the real reason.
   * @assistant group:integrations confirm
   */
  addCustomIntegration(
    input: AddCustomIntegrationInput,
  ): Promise<CustomIntegrationView> {
    return this.request("POST", "/integrations/custom/definitions", input);
  }
  /**
   * List the actions a user-added app offers.
   *
   * The compiled tools behind one custom integration (the detail card's
   * list), or `null` when the host does not serve the route (404 — old
   * build / gateway-fronted pod), mirroring `customIntegrations`. The
   * OTHER 404 — an unknown slug, marked `{code:"not_found"}` — is a real
   * miss and rethrows (a card open across a concurrent remove must not
   * read as "feature absent").
   * @assistant group:integrations
   */
  async customIntegrationTools(slug: string): Promise<CustomToolInfo[] | null> {
    try {
      return (
        await this.request<{ items: CustomToolInfo[] }>(
          "GET",
          `/integrations/custom/definitions/${this.seg(slug)}/tools`,
        )
      ).items;
    } catch (err) {
      if (
        isHoustonEngineError(err) &&
        err.status === 404 &&
        !isCustomSlugMiss(err)
      )
        return null;
      throw err;
    }
  }
  /**
   * Check what kind of service a pasted link points to, for one agent.
   *
   * `detectCustomIntegration` through the per-agent surface (the ONE form a
   * gateway-fronted deployment proxies to the pod — HOU-823).
   * @assistant group:integrations
   */
  detectAgentCustomIntegration(
    agentSlugOrId: string,
    url: string,
  ): Promise<CustomDetectResult> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/integrations/custom/detect`,
      { url },
    );
  }
  /**
   * Add an app of the user's own to one agent.
   *
   * `addCustomIntegration` through the per-agent surface (HOU-823).
   * @assistant group:integrations confirm
   */
  addAgentCustomIntegration(
    agentSlugOrId: string,
    input: AddCustomIntegrationInput,
  ): Promise<CustomIntegrationView> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions`,
      input,
    );
  }
  /**
   * Remove a user-added app from one agent.
   *
   * `removeCustomIntegration` through the per-agent surface (HOU-823).
   * @assistant group:integrations confirm
   */
  async removeAgentCustomIntegration(
    agentSlugOrId: string,
    slug: string,
  ): Promise<void> {
    await this.request(
      "DELETE",
      `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions/${this.seg(slug)}`,
    );
  }
  /**
   * List the actions one agent's user-added app offers.
   *
   * `customIntegrationTools` through the per-agent surface (HOU-823).
   * `null` on a route-absent 404 only, mirroring the top-level form.
   * @assistant group:integrations
   */
  async agentCustomIntegrationTools(
    agentSlugOrId: string,
    slug: string,
  ): Promise<CustomToolInfo[] | null> {
    try {
      return (
        await this.request<{ items: CustomToolInfo[] }>(
          "GET",
          `/agents/${this.seg(agentSlugOrId)}/integrations/custom/definitions/${this.seg(slug)}/tools`,
        )
      ).items;
    } catch (err) {
      if (
        isHoustonEngineError(err) &&
        err.status === 404 &&
        !isCustomSlugMiss(err)
      )
        return null;
      throw err;
    }
  }

  // ---------- triggers (C9 event-driven routines) ----------
  //
  // The catalog the routine editor's trigger picker reads, plus the per-routine
  // provisioning status it renders as a badge. Gated on `caps.triggers`; served
  // by the TS host (self-host) and by the cloud edge (managed). Off on desktop.

  /**
   * List the app events a routine can wake up on.
   *
   * The trigger catalog for one toolkit (C9) — the events a routine can wake on.
   * Read-only GET, so it replays safely on a transient transport blip.
   * @assistant group:routines
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
   * Check whether an agent's routine triggers are ready.
   *
   * One agent's per-routine trigger status (C9), or `null` when the host does
   * not serve triggers (404) — a deployment without event-driven routines (e.g.
   * desktop). Callers treat `null` as "triggers unsupported here" and hide the
   * badge; every other error still throws. Mirrors how `getAgentModelChoice`
   * degrades on a 404.
   * @assistant group:routines
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
   * Create a web address another service can call to start a routine.
   *
   * Mint (or rotate) a routine's incoming-webhook key. Returns the one-time
   * reveal (`url` + `secret` + `key_prefix`), or `null` when the host does not
   * serve webhook keys (404) — a deployment without a webhook backend (e.g.
   * desktop/self-host). Calling again ROTATES: the old secret is invalidated.
   * Only the gateway serves this route; the TS host 404s it. Mirrors how
   * `agentTriggerStatus` degrades on a 404.
   * @assistant group:routines confirm
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

  /**
   * Get the current workspace, your role, and its visible member roster.
   * @assistant group:org
   */
  getOrg(): Promise<OrgInfo> {
    return this.request("GET", "/org");
  }
  /**
   * Get names and photos for workspace members.
   *
   * Display profiles (name + photo) for the given member ids (any co-member of
   * the active space; the personal space resolves only the caller). Non-co-member
   * ids are omitted. Degrades to an empty map on a host without the route (404),
   * mirroring `getAgentModelChoice`'s swallow; every other error throws.
   * @assistant group:org
   */
  async getOrgProfiles(ids: string[]): Promise<UserProfilesResult> {
    if (ids.length === 0) return { profiles: {} };
    const query = new URLSearchParams({ ids: ids.join(",") }).toString();
    try {
      return await this.request<UserProfilesResult>(
        "GET",
        `/org/profiles?${query}`,
      );
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) {
        return { profiles: {} };
      }
      throw err;
    }
  }
  /**
   * List the people available for mentions in the current workspace.
   *
   * The sanitized co-member directory of the active space: every member the
   * caller shares the space with (the personal space resolves only the caller),
   * named-first. No emails, no roles — it exists so the composer can offer
   * @mentions and the renderer can chip them. Degrades to an empty list on a
   * host without the route (404), mirroring `getOrgProfiles`'s swallow, so a
   * pre-feature gateway simply offers no autocomplete; every other error throws.
   * @assistant group:org
   */
  async getOrgPeople(): Promise<OrgPerson[]> {
    try {
      const body = await this.request<{ people?: OrgPerson[] }>(
        "GET",
        "/org/people",
      );
      return body.people ?? [];
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return [];
      throw err;
    }
  }
  /**
   * Get your editable name and photo for the current workspace.
   *
   * The caller's OWN editable display profile (name + photo), effective values
   * plus which of them the user has overridden. Degrades to `null` on a host
   * without the route (404), mirroring `getOrgPeople`'s swallow, so on a
   * pre-feature gateway the Settings profile section simply never renders;
   * every other error throws.
   * @assistant group:org
   */
  async getMyProfile(): Promise<EditableProfile | null> {
    try {
      return await this.request<EditableProfile>("GET", "/me/profile");
    } catch (err) {
      if (isHoustonEngineError(err) && err.status === 404) return null;
      throw err;
    }
  }
  /**
   * Update your name or photo for the current workspace.
   *
   * Update the caller's own display profile. Per key: a string sets, `null`
   * clears back to the identity provider's value, an omitted key is untouched.
   * Answers the full effective profile, so the caller repaints from the host's
   * truth rather than its own optimistic guess. Deliberately does NOT swallow
   * 404 the way {@link getMyProfile} does — a write that silently reported
   * success on a host that never stored it is the exact silent failure this
   * codebase forbids; the 400 from a rejected name/photo throws too.
   * @assistant group:org
   */
  setMyProfile(update: EditableProfileUpdate): Promise<EditableProfile> {
    return this.request("PUT", "/me/profile", update);
  }
  /**
   * Invite or add a person to the current workspace with a chosen role.
   *
   * Add a member by email at a role (owner only; enforced by the host). A known
   * Houston user is added directly; an unknown email creates a pending invite
   * instead (host answers `202 {invited:true,...}`). The parsed body is returned
   * so the caller can tell the two apart (`invited` / `userId`).
   * @assistant group:org confirm
   */
  addOrgMember(email: string, role: OrgRole): Promise<AddOrgMemberResult> {
    return this.request("POST", "/org/members", { email, role });
  }
  /**
   * Revoke a pending workspace invitation.
   * @assistant group:org confirm
   */
  async deleteOrgInvite(inviteId: string): Promise<void> {
    await this.request("DELETE", `/org/invites/${this.seg(inviteId)}`);
  }
  /**
   * Remove a person from the current workspace.
   * @assistant group:org confirm
   */
  async removeOrgMember(userId: string): Promise<void> {
    await this.request("DELETE", `/org/members/${this.seg(userId)}`);
  }
  /**
   * Change a workspace member's role.
   * @assistant group:org confirm
   */
  async setOrgMemberRole(userId: string, role: OrgRole): Promise<void> {
    await this.request("PATCH", `/org/members/${this.seg(userId)}`, { role });
  }

  // ---------- Agent teams (C13) — v3 host only ----------
  //
  // Named groups of agents + people INSIDE one space, server-owned. A team is a
  // grouping, never a grant: joining one is a sidebar subscription and changes
  // no access. Every mutation fans out the `AgentsChanged` the client already
  // reacts to, so none of these methods needs its own refresh signal.
  //
  // NONE of them degrades a 404, deliberately — unlike `getOrgPeople` /
  // `listOrgs`, which swallow it to stay silent on a host that predates their
  // route. Here the caller feature-detects on `capabilities.agentTeams` FIRST,
  // so a 404 can only mean the host advertised the surface and then denied it.
  // Degrading would blank the whole rail and present "you have no teams" as the
  // truth — the exact silent failure this codebase forbids. It throws instead.

  /**
   * List this workspace's teams of agents and people.
   *
   * Every team of the active space, as the CALLER sees it: ordered by the
   * gateway (`sortOrder`, then creation), with `agentSlugs` role-filtered and
   * `joined`/`owner`/`memberCount` already resolved. A personal space answers
   * its REAL list too — the default team plus whatever its owner created, all
   * of them joined and owned by the one person in it — so the client renders it
   * with no branch. A GET, so it replays safely on a transient transport blip.
   * @assistant group:teams
   */
  async listAgentTeams(): Promise<AgentTeam[]> {
    const body = await this.request<{ teams?: AgentTeam[] }>(
      "GET",
      "/org/teams",
    );
    return body.teams ?? [];
  }
  /**
   * Create a team in this workspace.
   *
   * Create a team in the active space. Any member may (gating creation on an
   * org role would buy no safety when a team grants nothing); the creator gets
   * an explicit owner row and the team sorts last. `name` is trimmed server-side
   * and must be 1..60 runes (`400 invalid_name`). A POST, so `send` never
   * auto-replays it — the gateway has no dedup, so a LOST response must be
   * reconciled with {@link listAgentTeams}, never blind-retried.
   * @assistant group:teams
   */
  createAgentTeam(input: {
    name: string;
    icon?: string;
    color?: string;
  }): Promise<AgentTeam> {
    return this.request("POST", "/org/teams", input);
  }
  /**
   * Rename, reorder, or restyle a team.
   *
   * Rename, reorder or restyle one team (effective team owner only — identity
   * is not a structural property: the team you may rename is the team you may
   * style). Partial: an omitted key is untouched, so a rename must not also send
   * `sortOrder`. Allowed on the default team — that is the only way its name
   * changes, since its rail block deliberately offers no menu. Answers the full
   * team so the caller repaints from the host's truth rather than its own
   * optimistic guess.
   *
   * `icon`/`color` follow C13 §Team identity, and their three states are
   * distinct: a string SETS the field, `""` CLEARS it back to unset, and an
   * OMITTED key leaves it alone. `null` is NOT a clear — the gateway answers
   * `400`, exactly as it does for `{"name": null}`, because there is one
   * spelling for erasing a field and it is `""`. Neither field is trimmed
   * (unlike `name`): these are tokens a client generates, so whitespace in one
   * is a client bug worth the refusal. The gateway validates SHAPE only —
   * `icon` `^[a-z0-9-]{1,32}$` (`400 invalid_icon`), `color` `#rrggbb` or a
   * theme token name `^[a-z][a-z0-9-]{0,23}$` (`400 invalid_color`), both with
   * the flat `{error, code}` body — because the VOCABULARY is the client's and
   * a gateway policing the list would ship a release per glyph.
   *
   * `context` is the team's shared prose (see {@link AgentTeam.context}). It is
   * NOT an identity field: any string is valid, `""` is simply an empty context
   * rather than a special CLEAR, and it is never trimmed — the user's own line
   * breaks and indentation are the content.
   * @assistant group:teams
   */
  updateAgentTeam(
    teamId: string,
    patch: {
      name?: string;
      sortOrder?: number;
      icon?: string;
      color?: string;
      context?: string;
    },
  ): Promise<AgentTeam> {
    return this.request("PATCH", `/org/teams/${this.seg(teamId)}`, patch);
  }
  /**
   * Delete a team.
   *
   * Delete one team (effective team owner only). Its agents fall back to the
   * default team and its memberships cascade — both are database effects, so
   * there is nothing for the client to clean up beyond refetching. Refused with
   * `400 default_team` on the catch-all, which everything else depends on.
   * @assistant group:teams confirm
   */
  async deleteAgentTeam(teamId: string): Promise<void> {
    await this.request("DELETE", `/org/teams/${this.seg(teamId)}`);
  }
  /**
   * List the people who joined a team.
   *
   * One team's EXPLICIT membership rows (any member of the space may read
   * them). Implicit owners — an org owner/admin owns every team — are a
   * permission rule and never appear, so a roster that looks short next to
   * `memberCount` is correct: never derive the caller's own `joined`/`owner`
   * from this list, read them off the {@link AgentTeam}.
   * @assistant group:teams
   */
  async listAgentTeamMembers(teamId: string): Promise<AgentTeamMember[]> {
    const body = await this.request<{ members?: AgentTeamMember[] }>(
      "GET",
      `/org/teams/${this.seg(teamId)}/members`,
    );
    return body.members ?? [];
  }
  /**
   * Join a team.
   *
   * Subscribe the caller to a team (v1 teams are all public). Idempotent, and it
   * never demotes an existing owner row, so a double-click is harmless. A no-op
   * on the default team, which everyone is already in. One of the THREE
   * people-management routes a personal space refuses (`403 personal_space`) —
   * it holds one human, so there is nobody to subscribe to anyone's team.
   * @assistant group:teams
   */
  async joinAgentTeam(teamId: string): Promise<void> {
    await this.request("POST", `/org/teams/${this.seg(teamId)}/join`);
  }
  /**
   * Remove someone from a team, or leave it.
   *
   * Drop one membership row: the caller's own (leave) or someone else's (remove,
   * effective team owner only). Idempotent — removing a non-member still answers
   * `204`, so a double-click cannot 404. `400 default_team`: nobody leaves the
   * catch-all. `403 personal_space` in a personal space, ahead of that — there
   * are no people to manage there, whichever team is named.
   * @assistant group:teams confirm
   */
  async removeAgentTeamMember(teamId: string, userId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/org/teams/${this.seg(teamId)}/members/${this.seg(userId)}`,
    );
  }
  /**
   * Give someone ownership of a team, or take it away.
   *
   * Set (or clear) one member's explicit ownership of a team — effective team
   * owner only. An UPSERT: it also adds a member who never joined, and the
   * target must already be in the space (`400 not_a_member`). Demoting the last
   * explicit owner is allowed, because implicit owners always exist. Refused
   * with `400 default_team`, which carries no explicit rows at all, and with
   * `403 personal_space` ahead of that in a personal space.
   * @assistant group:teams confirm
   */
  async setAgentTeamMemberOwner(
    teamId: string,
    userId: string,
    owner: boolean,
  ): Promise<void> {
    await this.request(
      "PUT",
      `/org/teams/${this.seg(teamId)}/members/${this.seg(userId)}`,
      { owner },
    );
  }
  /**
   * Move an agent into another team.
   *
   * Move one agent to another team in the same space. The caller must own BOTH
   * the source and the target team, so no team owner can raid another's. This
   * changes GROUPING only — assignments, and therefore who may drive the agent,
   * are untouched. Re-issuing the agent's current team is a no-op `204`;
   * `400 invalid_team_id` when `teamId` is absent, blank, or not a string.
   * @assistant group:teams confirm
   */
  async setAgentTeam(agentSlugOrId: string, teamId: string): Promise<void> {
    await this.request("PUT", `/agents/${this.seg(agentSlugOrId)}/team`, {
      teamId,
    });
  }

  // ---------- spaces / teams (C8) — hosted gateway only ----------
  //
  // The caller's spaces list, self-serve team creation, and agent moves between
  // spaces. Gated on `caps.spaces`; the gateway is the sole enforcer. Kept here
  // for shim parity like the org methods above.

  /**
   * List the workspaces the user belongs to and any pending invitations.
   *
   * The caller's spaces + pending invites (C8 §Wire surface). Degrades to an
   * empty result on a host that predates spaces (404) — the switcher then shows
   * only the personal workspace, byte-identical to a pre-C8 deployment. Mirrors
   * how `getAgentModelChoice` swallows a 404; every other error throws.
   * @assistant group:spaces
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
   * Create a shared team workspace.
   *
   * Create a team space (C8 §Wire surface). NOT idempotent — the gateway has no
   * dedup, so on a LOST response DON'T blind-retry: reconcile via `listOrgs` and
   * reuse the persisted slug. Never degrades — a failure must reach the UI, so it
   * throws the real `HoustonEngineError`. A POST, so `send` never auto-replays it.
   * @assistant group:spaces
   */
  createOrg(name: string): Promise<OrgSummary> {
    return this.request("POST", "/orgs", { name });
  }
  /**
   * Accept an invitation to join a team workspace.
   *
   * Accept a pending invite addressed to the caller (C8 §Wire surface), by the
   * id that rides `listOrgs().invites`. Answers the joined space so the caller
   * can name it without a second read. Never degrades — every rejection is a
   * state the invitee must see: `404 invite_not_found` (revoked, already used,
   * or addressed to another email — the gateway deliberately can't tell them
   * apart), `409 already_member`, `403 needs_upgrade` (the team's trial ended).
   * A POST, so `send` never auto-replays it.
   * @assistant group:spaces confirm
   */
  async acceptOrgInvite(inviteId: string): Promise<OrgSummary> {
    const res = await this.request<{ org: OrgSummary }>(
      "POST",
      `/org-invites/${this.seg(inviteId)}/accept`,
    );
    return res.org;
  }
  /**
   * Decline an invitation to join a team workspace.
   *
   * Decline a pending invite addressed to the caller (C8 §Wire surface) — the
   * invitee's own `204`, NOT the owner's revoke (`deleteOrgInvite`, which is
   * org-scoped at `/org/invites/:id`). Never degrades: a `404 invite_not_found`
   * must reach the UI so the stale row explains itself.
   * @assistant group:spaces confirm
   */
  async declineOrgInvite(inviteId: string): Promise<void> {
    await this.request("DELETE", `/org-invites/${this.seg(inviteId)}`);
  }
  /**
   * Move an agent into a team workspace.
   *
   * Move an agent into a team space (C8 §Agent move). Returns the `moveId` to
   * poll with `getMoveStatus` to terminal `done` before inviting. Never degrades:
   * a `403 unsupported_move` / `409 unmovable_volume` / `403 needs_upgrade` must
   * surface, so it throws. A POST, so `send` never auto-replays it.
   * @assistant group:spaces confirm
   */
  moveAgent(agentSlugOrId: string, toSlug: string): Promise<AgentMoveStart> {
    return this.request("POST", `/agents/${this.seg(agentSlugOrId)}/move`, {
      to: toSlug,
    });
  }
  /**
   * Check how an agent's move to another workspace is going.
   *
   * Poll one agent-move's progress (C8). The move-completion signal is THIS route
   * only — the event fan-in relays pod-scoped events and must not be relied on for
   * completion. A GET, so it replays safely on a transient transport blip.
   * @assistant group:spaces
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
   * See the plan, trial, and payment status of the team workspace.
   *
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
   * @assistant group:billing
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
   * Start the checkout that subscribes the team workspace.
   *
   * Start a Stripe Checkout session for the active team (owner only; the gateway
   * 403s `not_owner` for an admin). Returns the hosted `{url}` to open. Never
   * degrades — a failure must reach the UI, so it throws the real
   * `HoustonEngineError`.
   * @assistant group:billing confirm
   */
  createCheckout(interval: "monthly" | "annual"): Promise<BillingCheckout> {
    return this.request("POST", "/org/billing/checkout", { interval });
  }
  /**
   * Open the billing page to change the card, see invoices, or cancel.
   *
   * Open the Stripe customer portal for the active team (owner only) — card,
   * invoices, interval switch, cancel. Returns the hosted `{url}`. Never degrades;
   * a failure throws so the UI surfaces the real reason.
   * @assistant group:billing confirm
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
   * List the user's active API keys.
   *
   * The caller's active API keys, newest first (C9 §Routes). No secrets — each
   * entry carries only its display `prefix`. A GET, so it replays safely on a
   * transient transport blip.
   * @assistant group:api-keys
   */
  listApiKeys(): Promise<ApiKey[]> {
    return this.request<{ keys: ApiKey[] }>("GET", "/keys").then((r) => r.keys);
  }
  /**
   * Create an API key for the user.
   *
   * Mint a personal API key (C9). Returns the FULL secret in `key`, exposed ONLY
   * here and never retrievable again, so the caller reveals it once and keeps it
   * out of any cache. `name` is trimmed 1..100 server-side; ≥20 active keys →
   * `400 {code:"key_limit"}`, which the UI renders inline (revoke to free a
   * slot). A POST, so `send` never auto-replays it.
   * @assistant group:api-keys confirm
   */
  createApiKey(name: string): Promise<ApiKeyCreated> {
    return this.request("POST", "/keys", { name });
  }
  /**
   * Permanently revoke an API key.
   *
   * Soft-revoke a key by id (C9). Idempotent from the user's view: an unknown,
   * foreign, or already-revoked id answers `404` (no existence leak). Returns
   * nothing on success (`204`).
   * @assistant group:api-keys confirm
   */
  revokeApiKey(id: string): Promise<void> {
    return this.request("DELETE", `/keys/${this.seg(id)}`);
  }

  // ---------- per-agent assignments (multiplayer) ----------

  /**
   * Choose who may use an agent, and at what access level.
   *
   * Set who may use this agent, and at what access level (Teams v2).
   *
   * Pass `AgentAssignment[]` (`{userId, access}`) to send the v2 body
   * `{assignments}` — the host set-replaces the roster and honors each
   * per-person `manager`/`user` level. Pass a plain `string[]` of user ids to
   * send the legacy body `{userIds}` (mapped to `access: "user"` server-side,
   * except users who already had `manager` keep it). An empty array takes the
   * legacy `{userIds: []}` path, preserving the old "empty = everyone" meaning.
   * Gate: owner any agent; admin only if agent-manager (enforced by the host).
   * @assistant group:agents confirm
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
   * Read which apps and AI models an agent is allowed to use.
   *
   * Read this agent's Teams settings (any assigned caller or owner):
   * `allowedToolkits` (the agent's integration ceiling — the whole effective
   * allowlist, policy is per agent only) and the caller's effective `access`.
   * @assistant group:agents
   */
  getAgentSettings(agentSlugOrId: string): Promise<AgentSettings> {
    return this.request("GET", `/agents/${this.seg(agentSlugOrId)}/settings`);
  }
  /**
   * Choose which apps and AI models an agent is allowed to use.
   *
   * Replace this agent's manager-set ceilings (agent-manager only). Pass
   * `allowedToolkits` (the integration ceiling: `null` = unrestricted, `[]` =
   * none — the host also prunes now-disallowed toolkits from existing grants so
   * revocation takes effect immediately) and/or `allowedModels` (the AI-model
   * ceiling: `null` = every model allowed, `[]` = none). Both fields are
   * optional so a caller can update one ceiling without touching the other.
   * @assistant group:agents confirm
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
   * Read which AI model the user picked for an agent.
   *
   * Read the ACTING user's model choice for this agent plus the agent's
   * effective `allowedModels` ceiling (any assigned caller / owner). Returns
   * `null` when the host does not serve model choices (404) — a non-Teams host —
   * so the composer degrades to its single-player behavior; every other error
   * throws.
   * @assistant group:agents
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
   * Choose which AI model an agent uses.
   *
   * Set the ACTING user's model choice for this agent (any assigned caller). The
   * gateway validates the model is within the agent's `allowedModels` ceiling
   * and answers `400 {code:"model_not_allowed"}` otherwise.
   * @assistant group:agents
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
   * Read the workspace's log of who did what.
   *
   * Read the org audit log, newest first (owner org-wide; admin filtered to
   * their managed agents; plain members 403). `before` pages by entry id,
   * `limit` caps the page (host clamps to ≤ 200).
   * @assistant group:org
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
   * See how much each person and agent used the workspace.
   *
   * Read per-agent/user usage counters over the last `days` (owner org-wide;
   * admin their managed agents; plain members 403). Host clamps `days` to ≤ 90.
   * @assistant group:org
   */
  async orgUsage(days: number): Promise<UsageRow[]> {
    return (
      await this.request<{ rows: UsageRow[] }>("GET", "/org/usage", undefined, {
        days: days.toString(),
      })
    ).rows;
  }
  /**
   * See how much running time each agent used.
   *
   * Per-agent compute usage (engine running time) over the last `days`, scoped
   * server-side to the agents the caller can access. Only deployments that
   * advertise `capabilities.computeUsage` serve it. Host clamps `days` to ≤ 90.
   * @assistant group:org
   */
  async computeUsage(days: number): Promise<ComputeUsage> {
    return await this.request<ComputeUsage>(
      "GET",
      "/org/compute-usage",
      undefined,
      { days: days.toString() },
    );
  }
  /**
   * Put aside the question an agent is waiting on.
   *
   * Retire a conversation's pending interaction by appending a durable stop
   * marker (the stepper X / abandon). A runtime passthrough — like a real Stop,
   * the model learns nothing from it.
   * @assistant group:chat hidden
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
   * Drop a conversation's messages from one message onward.
   *
   * Edit-and-resend rewind (PRODUCT-1217): drop the conversation's transcript
   * tail from the named user turn onward, so the caller can resend an edited
   * version of that message with a normal send. A runtime passthrough via the
   * host's channel dispatch, like `dismissInteraction`. Answers 409 while a
   * turn is queued or running, 404 when the turn id is unknown.
   * @assistant group:chat hidden
   */
  async truncateConversation(
    agentSlugOrId: string,
    conversationId: string,
    turnId: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/agents/${this.seg(agentSlugOrId)}/conversations/${this.seg(conversationId)}/truncate`,
      { turnId },
    );
  }
  /**
   * Switch how the running turn of a conversation behaves.
   *
   * Apply a Mode-pill switch to a conversation's EXECUTING turn (Claude Code's
   * shift+tab semantics): the running turn adopts the new mode at its next tool
   * decision. `applied: false` is benign — no turn was running, and the next
   * send pins the mode itself. A runtime passthrough via the host's channel
   * dispatch, like `dismissInteraction`.
   * @assistant group:chat hidden
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

  /**
   * Browse the agents offered in the Agent Store.
   * @assistant group:store
   */
  storeCatalog(): Promise<StoreListing[]> {
    return this.request("GET", "/store/catalog");
  }
  /**
   * Search the Agent Store.
   * @assistant group:store
   */
  storeSearch(q: string): Promise<StoreListing[]> {
    return this.request("GET", "/store/search", undefined, { q });
  }
  /**
   * Install an agent from the Agent Store.
   * @assistant group:store confirm
   */
  installStoreAgent(req: InstallAgent): Promise<void> {
    return this.request("POST", "/store/installs", req);
  }
  /**
   * Uninstall an agent that came from the Agent Store.
   * @assistant group:store confirm
   */
  uninstallStoreAgent(agentId: string): Promise<void> {
    return this.request("DELETE", `/store/installs/${this.seg(agentId)}`);
  }
  /**
   * Install an agent from a GitHub repository.
   * @assistant group:agents confirm
   */
  installAgentFromGithub(req: InstallFromGithub): Promise<{ agentId: string }> {
    return this.request("POST", "/agents/install-from-github", req);
  }
  /**
   * Check whether any installed agent has an update available.
   * @assistant group:agents
   */
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

  /**
   * Upload files to attach to a message.
   * @assistant group:attachments hidden
   */
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
  /**
   * Permanently delete the files attached to a message.
   * @assistant group:attachments confirm
   */
  deleteAttachments(scopeId: string): Promise<void> {
    return this.request("DELETE", `/attachments/${this.seg(scopeId)}`);
  }
  /**
   * List the files attached to a message.
   * @assistant group:attachments
   */
  listAttachments(scopeId: string): Promise<AttachmentManifest[]> {
    return this.request("GET", `/attachments/${this.seg(scopeId)}`);
  }

  // ---------- worktree / shell ----------

  /**
   * Create a separate working copy of a project's code.
   * @assistant group:system hidden
   */
  createWorktree(req: CreateWorktreeRequest): Promise<WorktreeInfo> {
    return this.request("POST", "/worktrees", req);
  }
  /**
   * List the separate working copies of a project's code.
   * @assistant group:system hidden
   */
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
  /**
   * Remove a separate working copy of a project's code.
   * @assistant group:system hidden
   */
  removeWorktree(req: RemoveWorktreeRequest): Promise<void> {
    return this.request("POST", "/worktrees/remove", req);
  }
  /**
   * Run a command on this computer.
   * @assistant group:system hidden
   */
  runShell(req: RunShellRequest): Promise<string> {
    return this.request("POST", "/shell", req);
  }

  // ---------- tunnel (mobile pairing + device-token management) ----------

  /**
   * Check whether the phone connection is available.
   * @assistant group:system hidden
   */
  tunnelStatus(): Promise<TunnelStatus> {
    return this.request("GET", "/tunnel/status");
  }
  /**
   * Create a code that pairs a phone with this Houston.
   * @assistant group:system hidden
   */
  mintPairingCode(): Promise<PairingCode> {
    return this.request("POST", "/tunnel/pairing");
  }
  /**
   * Revoke every paired phone and issue a fresh pairing code.
   * @assistant group:system hidden
   */
  resetPhoneAccess(): Promise<PairingCode> {
    return this.request("POST", "/tunnel/reset-access");
  }

  // ---------- push (mobile notification registration) ----------

  /**
   * Register a phone to receive notifications.
   * @assistant group:system hidden
   */
  registerPushDevice(req: PushRegisterRequest): Promise<{ ok: boolean }> {
    return this.request("POST", "/push/register", req);
  }
  /**
   * Stop a phone from receiving notifications.
   * @assistant group:system hidden
   */
  unregisterPushDevice(deviceToken: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", "/push/unregister", { deviceToken });
  }

  // ---------- sessions ----------

  /**
   * Send a message to an agent and set it working.
   *
   * Start a session. `agentPath` is percent-encoded as a single path segment.
   * @assistant group:chat confirm
   */
  startSession(
    agentPath: string,
    req: SessionStartRequest,
  ): Promise<SessionStartResponse> {
    return this.request("POST", `/agents/${this.seg(agentPath)}/sessions`, req);
  }
  /**
   * Drop a message that is still waiting in the send queue.
   *
   * Drop one queued (not yet sent) message from a conversation's send queue.
   * INERT here: the queue lives in the host engine-adapter (the aliased
   * implementation every build runs); this stub only keeps the unaliased
   * surface shape-identical.
   * @assistant group:chat hidden
   */
  removeQueuedMessage(
    _agentPath: string,
    _sessionKey: string,
    _id: string,
  ): void {}
  /**
   * Stop an agent that is currently working.
   * @assistant group:chat confirm
   */
  cancelSession(
    agentPath: string,
    sessionKey: string,
  ): Promise<SessionCancelResponse> {
    return this.request(
      "POST",
      `/agents/${this.seg(agentPath)}/sessions/${this.seg(sessionKey)}:cancel`,
    );
  }
  /**
   * Start the guided first conversation with an agent.
   * @assistant group:chat hidden
   */
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
   * Load the messages of a conversation.
   *
   * `opts.observe` (default true) is consumed by the new-engine adapter, where
   * opening a chat also attaches a passive observer stream: bulk history reads
   * (mission search, board scans) pass `false` so N loads don't spawn N
   * streams. The Rust engine's WS delivers everything already — here the flag
   * is accepted for signature parity and ignored.
   * @assistant group:chat hidden
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
  /**
   * Load the previous page of a conversation's messages.
   *
   * Prepend the previous transcript page before the loaded window (HOU-819).
   * Implemented by the v3 host adapter (which owns the conversation VM the
   * page prepends into); this legacy client loads full histories, so there is
   * never an older page to fetch.
   * @assistant group:chat hidden
   */
  loadOlderChatHistory(
    _agentPath: string,
    _sessionKey: string,
  ): Promise<{ hasOlder: boolean }> {
    return Promise.resolve({ hasOlder: false });
  }
  /**
   * Summarize a message into a short title.
   * @assistant group:chat
   */
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

  /**
   * Draft an agent's instructions from a short description.
   * @assistant group:agents
   */
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

  /**
   * Run a routine immediately.
   * @assistant group:routines confirm
   */
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
  /**
   * Cancel a routine run that is in progress.
   * @assistant group:routines confirm
   */
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
  /**
   * Start scheduling routines for an agent.
   * @assistant group:routines
   */
  startRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/start", undefined, {
      agentPath,
    });
  }
  /**
   * Stop scheduling routines for an agent.
   * @assistant group:routines
   */
  stopRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/stop", undefined, {
      agentPath,
    });
  }
  /**
   * Synchronize an agent's routine schedule now.
   * @assistant group:routines
   */
  syncRoutineScheduler(agentPath: string): Promise<void> {
    return this.request("POST", "/routines/scheduler/sync", undefined, {
      agentPath,
    });
  }

  // ---------- agent file watcher ----------

  /**
   * Start watching an agent's folder for changes.
   * @assistant group:system hidden
   */
  startAgentWatcher(agentPath: string): Promise<void> {
    return this.request("POST", "/watcher/start", { agentPath });
  }
  /**
   * Stop watching an agent's folder for changes.
   * @assistant group:system hidden
   */
  stopAgentWatcher(): Promise<void> {
    return this.request("POST", "/watcher/stop");
  }

  // ---------- claude (runtime installer) ----------

  /**
   * Check whether the Claude Code runtime is installed.
   *
   * Snapshot of the runtime Claude Code install — used by the
   * onboarding "Sign in with Anthropic" card so it can show a clear
   * "couldn't reach Anthropic" / "Retry" instead of the misleading
   * "install it yourself" hint that fires for every other
   * `cli_installed=false` case (issue #231).
   * @assistant group:system hidden
   */
  claudeStatus(): Promise<ClaudeStatus> {
    return this.request("GET", "/claude/status");
  }
  /**
   * Install the Claude Code runtime.
   *
   * Kick off a fresh install in the background. The HTTP request
   * returns immediately; progress + completion stream over the WS
   * firehose as `ClaudeCliInstalling` / `ClaudeCliReady` /
   * `ClaudeCliFailed` events.
   * @assistant group:system hidden
   */
  claudeInstall(): Promise<void> {
    return this.request("POST", "/claude/install");
  }

  // ---------- composio ----------

  /**
   * Check whether the app-connection service is signed in.
   * @assistant group:integrations
   */
  composioStatus(): Promise<ComposioStatus> {
    return this.request("GET", "/composio/status");
  }
  /**
   * Check whether the app-connection helper is installed.
   * @assistant group:integrations
   */
  composioCliInstalled(): Promise<boolean> {
    return this.request<{ installed: boolean }>(
      "GET",
      "/composio/cli-installed",
    ).then((r) => r.installed);
  }
  /**
   * Install the app-connection helper.
   * @assistant group:integrations
   */
  composioInstallCli(): Promise<void> {
    return this.request("POST", "/composio/cli");
  }
  /**
   * Start signing in to the app-connection service.
   * @assistant group:integrations
   */
  composioStartLogin(): Promise<ComposioStartLoginResponse> {
    return this.request("POST", "/composio/login");
  }
  /**
   * Finish signing in to the app-connection service.
   * @assistant group:integrations
   */
  composioCompleteLogin(cliKey: string): Promise<void> {
    return this.request("POST", "/composio/login/complete", { cliKey });
  }
  /**
   * Sign out of the app-connection service.
   * @assistant group:integrations
   */
  composioLogout(): Promise<void> {
    return this.request("POST", "/composio/logout");
  }
  /**
   * List the apps the connection service offers.
   * @assistant group:integrations
   */
  composioListApps(): Promise<ComposioAppEntry[]> {
    return this.request("GET", "/composio/apps");
  }
  /**
   * List the apps already connected through the connection service.
   * @assistant group:integrations
   */
  composioListConnections(): Promise<string[]> {
    return this.request("GET", "/composio/connections");
  }
  /**
   * Connect an app through the connection service.
   * @assistant group:integrations
   */
  composioConnectApp(toolkit: string): Promise<ComposioStartLinkResponse> {
    return this.request("POST", "/composio/connections", { toolkit });
  }
  /**
   * Disconnect an app from the connection service.
   *
   * Disconnect a toolkit: removes its connected account(s).
   * @assistant group:integrations
   */
  composioDisconnect(toolkit: string): Promise<void> {
    return this.request("POST", "/composio/connections/disconnect", {
      toolkit,
    });
  }
  /**
   * Renew an app connection that expired.
   *
   * Reconnect a toolkit by refreshing its auth. Resolves to a browser URL
   * the user must open to complete OAuth re-consent, or `null` when the
   * auth scheme refreshed silently.
   * @assistant group:integrations
   */
  composioReconnect(toolkit: string): Promise<ComposioReconnectResponse> {
    return this.request("POST", "/composio/connections/reconnect", { toolkit });
  }
  /**
   * Watch for an app connection to complete.
   *
   * Ask the engine to actively watch for `toolkit` to land in the
   * consumer connections list and emit `ComposioConnectionAdded` over
   * the WS firehose when it does. Idempotent — duplicate calls while
   * a watch is active are no-ops on the engine. Returns immediately;
   * the result arrives as a WS event.
   * @assistant group:integrations
   */
  composioWatchConnection(toolkit: string): Promise<void> {
    return this.request("POST", "/composio/connections/watch", { toolkit });
  }

  // ---------- portable agent share / import ----------

  /**
   * Preview what would be included when sharing an agent.
   * @assistant group:agents
   */
  portablePreview(agentPath: string): Promise<PortableInventoryPreview> {
    return this.request("GET", "/agents/portable/preview", undefined, {
      agentPath,
    });
  }
  /**
   * Package an agent into a file the user can share.
   * @assistant group:agents confirm
   */
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
  /**
   * Take personal details out of an agent package before sharing it.
   * @assistant group:agents
   */
  portableAnonymize(
    agentPath: string,
    req: PortableAnonymizeRequest,
  ): Promise<PortableAnonymizeResponse> {
    return this.request("POST", "/agents/portable/anonymize", req, {
      agentPath,
    });
  }
  /**
   * Read a shared agent package and show what is inside.
   * @assistant group:agents hidden
   */
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
  /**
   * Check a shared agent package for anything unsafe before installing it.
   * @assistant group:agents
   */
  importScan(packageId: string): Promise<PortableScanResponse> {
    return this.request("POST", "/store/imports/scan", { packageId });
  }
  /**
   * Open a shared agent link and get it ready to install.
   *
   * Fetch a published agent from an Agent Store share link (or bare slug) and
   * park it for install, returning the SAME preview a file upload would. The
   * host resolves the link, validates the IR, and maps it to portable content
   * (SSRF-guarded); the parked package then flows through scan/install unchanged.
   * @assistant group:agents
   */
  importFromStoreLink(url: string): Promise<PortableUploadPreviewResponse> {
    return this.request("POST", "/store/imports/from-link", { url });
  }
  /**
   * Install an agent from a shared package.
   * @assistant group:agents confirm
   */
  importInstall(req: PortableInstallRequest): Promise<PortableInstalledAgent> {
    return this.request("POST", "/store/imports/install", req);
  }

  // ---------- agent data migration (agent-scoped, HOU-719 routes) ----------
  //
  // The same export/import pair the desktop→cloud migration uses, reachable on
  // any host for any agent the caller manages: "Copy an agent" moves the
  // source's chats into the copy through it. Paths are agent-root relative
  // and must sit inside the host's migration scope.

  async migrationExport(
    agentPath: string,
    paths: string[],
  ): Promise<ArrayBuffer> {
    const res = await this.send(
      () => ({
        url: `${this.baseUrl}/v1/agents/${encodeURIComponent(agentPath)}/migration/export`,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...this.orgHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paths }),
        },
      }),
      true, // read-only POST: zips and returns, writes nothing
    );
    if (!res.ok) throw await this.toError(res);
    return await res.arrayBuffer();
  }
  async migrationImport(
    agentPath: string,
    bytes: ArrayBuffer,
    opts?: MigrationImportOptions,
  ): Promise<MigrationImportResult> {
    const q = new URLSearchParams();
    if (opts?.overwrite) q.set("overwrite", "1");
    if (opts?.sessions === false) q.set("sessions", "0");
    const query = q.size ? `?${q.toString()}` : "";
    const res = await this.send(
      () => ({
        url: `${this.baseUrl}/v1/agents/${encodeURIComponent(agentPath)}/migration/import${query}`,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...this.orgHeaders(),
            "Content-Type": "application/zip",
          },
          body: bytes,
        },
      }),
      // Idempotent by design (skip-existing per entry), so a replay against a
      // host still coming up lands the same files once.
      true,
    );
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as MigrationImportResult;
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

  /**
   * Publish an agent to the Agent Store and get its public link.
   *
   * Publish this agent to the Agent Store; returns the public share URL. A kept
   * pointer re-publishes the SAME store agent so a re-publish never duplicates.
   * @assistant group:store confirm
   */
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

  /**
   * Update what a published agent shares in the Agent Store.
   *
   * Re-publish an already-listed agent with a freshly gathered selection.
   * @assistant group:store confirm
   */
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

  /**
   * Take an agent's Agent Store listing down.
   *
   * Take the listing down; the pointer is kept so a re-publish reuses the agent.
   * @assistant group:store confirm
   */
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

  /**
   * Check whether an agent is published in the Agent Store.
   *
   * Whether this agent is linked to a listing, and its live state.
   * @assistant group:store
   */
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

  /**
   * List the Agent Store listings the user owns.
   *
   * Every listing the caller owns, in all lifecycle states (`GET /me/agents`).
   * @assistant group:store
   */
  listMyStoreAgents(): Promise<MyAgent[]> {
    return this.request<{ items: MyAgent[] }>(
      "GET",
      "/agentstore/me/agents",
    ).then((r) => r.items);
  }
  /**
   * Ask Houston to make one of the user's listings public.
   *
   * Ask an admin to make an owned listing public (`PATCH … {requestPublic}`).
   * @assistant group:store confirm
   */
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
  /**
   * Make a public listing unlisted again.
   *
   * Drop a public listing back to unlisted (`PATCH … {visibility:"unlisted"}`).
   * @assistant group:store confirm
   */
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
  /**
   * Publish one of the user's Agent Store listings.
   *
   * Publish (or re-publish) an owned listing (`PATCH … {publish}`).
   * @assistant group:store confirm
   */
  async publishStoreAgentById(storeAgentId: string): Promise<void> {
    await this.request(
      "PATCH",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
      { publish: true },
      undefined,
      undefined,
      false,
    );
  }
  /**
   * Edit how one of the user's listings is presented in the Agent Store.
   *
   * Edit an owned listing's store metadata (`PATCH … {identity}`).
   * @assistant group:store confirm
   */
  async updateStoreAgentIdentity(
    storeAgentId: string,
    identity: AgentIdentityPatch,
  ): Promise<void> {
    await this.request(
      "PATCH",
      `/agentstore/agents/${this.seg(storeAgentId)}`,
      { identity },
      undefined,
      undefined,
      false,
    );
  }
  /**
   * Take one of the user's Agent Store listings down.
   *
   * Take an owned listing down by its gateway id (`PATCH … {unpublish}`).
   * @assistant group:store confirm
   */
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
  /**
   * Permanently delete one of the user's Agent Store listings.
   *
   * Soft-delete an owned listing by its gateway id (`DELETE /agents/{id}`).
   * @assistant group:store confirm
   */
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

  /**
   * Read the user's public creator profile.
   *
   * The caller's own creator profile, or `null` when never materialized.
   * @assistant group:store
   */
  async getMyStoreProfile(): Promise<CreatorProfile | null> {
    const { profile } = await this.request<{
      profile: CreatorProfile | null;
    }>("GET", "/agentstore/me/profile");
    return profile;
  }
  /**
   * Update the user's public creator profile.
   *
   * Upsert the caller's creator profile (`PATCH /me/profile`).
   * @assistant group:store confirm
   */
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
  /**
   * Check whether a creator handle is still available.
   *
   * Whether a handle is claimable by the caller (`GET /handles/{handle}/available`).
   * @assistant group:store
   */
  checkStoreHandle(handle: string): Promise<HandleAvailability> {
    return this.request<HandleAvailability>(
      "GET",
      `/agentstore/handles/${this.seg(handle)}/available`,
    );
  }
  /**
   * Replace the creator profile photo.
   *
   * Replace the caller's avatar (`POST /me/avatar`, multipart field `file`).
   * @assistant group:store hidden
   */
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
  /**
   * Remove the creator profile photo.
   *
   * Clear the caller's avatar (`DELETE /me/avatar`). Idempotent.
   * @assistant group:store confirm
   */
  async deleteStoreAvatar(): Promise<void> {
    await this.request("DELETE", "/agentstore/me/avatar");
  }
  /**
   * See how many people installed the user's published agents.
   *
   * Per-UTC-day install analytics over the caller's owned agents (`GET /me/analytics?days=`).
   * @assistant group:store
   */
  getMyStoreAnalytics(days?: number): Promise<CreatorAnalytics> {
    return this.request<CreatorAnalytics>(
      "GET",
      "/agentstore/me/analytics",
      undefined,
      { days: days !== undefined ? String(days) : undefined },
    );
  }

  // ---------- WebSocket access (see ws.ts) ----------

  /**
   * Build the live-updates address for this Houston.
   * @assistant group:system hidden
   */
  wsUrl(): string {
    const ws = this.baseUrl.replace(/^http/, "ws");
    return `${ws}/v1/ws?token=${encodeURIComponent(this.token)}`;
  }
}

/** The custom-integration slug-scoped 404: the host marks an UNKNOWN SLUG
 *  with a top-level `{code:"not_found"}` body, distinct from a bare 404
 *  meaning the whole route family is absent (old build / gateway). */
function isCustomSlugMiss(err: HoustonEngineError): boolean {
  return (
    (err.body as unknown as { code?: string } | null)?.code === "not_found"
  );
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

/**
 * The synthetic body the hosted transport answers with when a gateway call is
 * attempted with no session at all (signed out, or mid account-switch).
 */
export const SIGNED_OUT_ERROR = "signed_out";

/**
 * True for the transport's synthetic signed-out 401. Signed-out is an EXPECTED
 * lifecycle state — the sign-in screen is the surface — so callers use this to
 * skip the error-toast/report path a real failure would take.
 */
export function isSignedOutEngineError(e: unknown): boolean {
  return (
    isHoustonEngineError(e) &&
    e.status === 401 &&
    (e.body as { error?: unknown } | null)?.error === SIGNED_OUT_ERROR
  );
}
