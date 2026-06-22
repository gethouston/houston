import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, AgentId, UserId, Workspace, WorkspaceId, WorkspaceRuntime } from "./domain/types";

/**
 * The control plane's outward dependencies, as interfaces ("ports"). Each has at
 * least an in-memory / fake implementation (tested, used in `dev` mode) and a live
 * implementation (Postgres / GKE / Supabase) behind the same shape. The core logic
 * never imports a concrete adapter — only these.
 */

/** Persistence for workspaces + agents. Impls: MemoryWorkspaceStore, PgWorkspaceStore. */
export interface WorkspaceStore {
  /** The user's personal workspace, creating it on first access (lazy provisioning). */
  getOrCreatePersonalWorkspace(userId: UserId): Promise<Workspace>;
  /** A workspace by id — the RuntimeLauncher needs its slug for the K8s namespace. */
  getWorkspace(id: WorkspaceId): Promise<Workspace | null>;

  getAgent(id: AgentId): Promise<Agent | null>;
  /** All agents in a workspace (the owner sees every one). */
  listAgents(workspaceId: WorkspaceId): Promise<Agent[]>;
  /** Every workspace (admin/operator only — the dashboard enumerates all tenants). */
  listWorkspaces(): Promise<Workspace[]>;
  /** The caller's own workspaces — cloud personal-tier returns one, local many. */
  listWorkspacesForUser(userId: UserId): Promise<Workspace[]>;
  /** Every agent across all workspaces (admin/operator only). */
  listAllAgents(): Promise<Agent[]>;
  createAgent(input: { workspaceId: WorkspaceId; name: string }): Promise<Agent>;
  renameAgent(id: AgentId, name: string): Promise<Agent>;
  deleteAgent(id: AgentId): Promise<void>;
  /** Flip a workspace between hosting runtimes (admin-driven migration control). */
  setWorkspaceRuntime(id: WorkspaceId, runtime: WorkspaceRuntime): Promise<Workspace>;
}

/** Verifies a caller's bearer token and resolves it to a principal. */
export interface TokenVerifier {
  /** Returns the principal's user id, or null if the token is invalid/expired. */
  verify(bearer: string): Promise<{ userId: UserId } | null>;
}

/** Where an agent's sandbox can be reached once it is awake. */
export interface RuntimeEndpoint {
  /** Base URL of the agent's runtime, e.g. http://10.0.3.4:4317 */
  baseUrl: string;
  /** Bearer the runtime expects (per-sandbox, control-plane-issued). */
  token: string;
}

/**
 * One per-agent request to forward to the sandbox runtime, already stripped of
 * the `/agents/:agentId` prefix. The control plane relays method + sub-path +
 * query + raw body 1:1 under the sandbox Bearer (chat, SSE events, provider
 * device-code login, settings — every runtime route).
 */
export interface ForwardRequest {
  method: string;
  /** Runtime path with a leading slash, e.g. "/auth/openai-codex/login". */
  path: string;
  /** Raw query string including the leading "?", or "" (caller auth params stripped). */
  search: string;
  /** The caller's Content-Type, forwarded with a non-GET body. */
  contentType?: string | null;
  /** Raw request body for non-GET methods. */
  body?: Buffer;
}

export type RuntimeState = "running" | "asleep" | "absent";

/**
 * Lifecycle of an agent's STANDING runtime instance. Impls: FakeLauncher,
 * GkeLauncher (one pod + PVC per agent); the local profile adds a subprocess
 * launcher (P4). Per-turn runtimes (cloudrun) have no launcher — nothing stands.
 */
export interface RuntimeLauncher {
  /** Ensure the agent's runtime is running (spawn or wake it). Returns where to reach it. */
  ensureAwake(agent: Agent): Promise<RuntimeEndpoint>;
  /** Sleep the runtime (scale to zero / SIGTERM), persisting its state. */
  sleep(agentId: AgentId): Promise<void>;
  /** Permanently delete the runtime. Keeps the volume unless dropVolume. */
  destroy(agentId: AgentId, opts?: { dropVolume?: boolean }): Promise<void>;
  status(agentId: AgentId): Promise<RuntimeState>;
}

/** The (workspace, agent) pair every channel operation is scoped to. */
export interface ChannelCtx {
  workspace: Workspace;
  agent: Agent;
}

/**
 * A routine's pinned model/effort, carried into the turn it fires. Absent
 * fields mean "inherit the agent default", resolved by the runtime.
 */
export interface TurnPin {
  model?: string | null;
  effort?: string | null;
}

export type CaptureResult =
  | { ok: true; provider: string }
  | { ok: false; status: number; error: string; detail?: string };

/**
 * How the host reaches an agent's runtime surface. ONE interface, one adapter
 * per hosting model — ProxyChannel (standing runtime: GKE pod today, local
 * subprocess in P4) and TurnChannel (per-turn Cloud Run). The server picks the
 * channel by `workspace.runtime` and never branches on the hosting model again.
 */
export interface RuntimeChannel {
  /** Serve one runtime-surface request (chat, SSE events, providers, settings, files) 1:1. */
  dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void>;
  /**
   * Programmatically start a turn (no HTTP request behind it) — the scheduler's
   * path for firing a routine's prompt into a conversation. Resolves once the
   * turn is ACCEPTED; throws when it can't be started (busy / quota / transport)
   * so the caller records an errored run instead of a silent miss.
   *
   * `pin` carries the routine's model/effort overrides (absent = inherit).
   */
  fireTurn(ctx: ChannelCtx, conversationId: string, text: string, pin?: TurnPin): Promise<void>;
  /** Tear down the agent's runtime-side state (volume / object prefix) before record deletion. */
  teardown(ctx: ChannelCtx): Promise<void>;
  /** Connect-once: pull/confirm the workspace credential after the user connects. */
  captureCredential(ctx: ChannelCtx): Promise<CaptureResult>;
  /**
   * Connect-once for an API-key provider (OpenCode Zen / Go): store the pasted
   * key centrally for the workspace. No OAuth dance, nothing to refresh or scrub.
   * A standing-runtime channel also pushes it to the live runtime so the provider
   * reads as connected immediately; the per-turn channel just stores it centrally.
   */
  saveApiKeyCredential(ctx: ChannelCtx, provider: string, apiKey: string): Promise<void>;
  /**
   * Connect-once logout: forget the workspace's central credential for a provider
   * so no future turn can re-serve it. The inverse of captureCredential — clearing
   * only a runtime's local auth.json is undone by the next turn's re-serve.
   */
  forgetCredential(ctx: ChannelCtx, provider: string): Promise<void>;
}

/**
 * The user's OWN AI credential for a workspace (connect-once), held centrally so
 * every agent in the workspace shares one connection and the control plane is the
 * single owner. Two kinds:
 *  - `oauth` (Claude / Codex subscriptions): an access token + refresh token the
 *    control plane rotates centrally.
 *  - `api_key` (OpenCode Zen / Go): a pasted, static key. It never expires and
 *    has no refresh token, so `refreshToken` is "" and `expiresAt` is 0 — the
 *    sentinel every serve/refresh path treats as "never refresh".
 */
export interface WorkspaceCredential {
  workspaceId: WorkspaceId;
  /** "openai-codex" | "anthropic" | "opencode" | "opencode-go". */
  provider: string;
  /** OAuth access token, or — for an api_key credential — the API key itself. */
  accessToken: string;
  /** OAuth refresh token; "" for an api_key credential. */
  refreshToken: string;
  /** Unix epoch ms the access token expires; 0 for an api_key credential (never). */
  expiresAt: number;
  /** The ChatGPT account id (codex) — the backend needs it; preserved across refreshes. */
  accountId?: string;
  /** Credential kind. Absent is read as "oauth" (every legacy credential). */
  kind?: "oauth" | "api_key";
}

/** A credential is an API key when explicitly tagged, or by the expiresAt=0 sentinel. */
export function isApiKeyCredential(cred: WorkspaceCredential): boolean {
  return cred.kind === "api_key" || cred.expiresAt === 0;
}

/** Stores + serves the one connect-once credential per (workspace, provider). */
export interface CredentialStore {
  get(workspaceId: WorkspaceId, provider: string): Promise<WorkspaceCredential | null>;
  /** Upsert (overwrite in place on refresh). */
  put(cred: WorkspaceCredential): Promise<void>;
  remove(workspaceId: WorkspaceId, provider: string): Promise<void>;
}

/** Mints/validates the non-secret per-sandbox identity tokens (HMAC). */
export interface CredentialVault {
  /** Mint the non-secret token a sandbox carries to /sandbox/credential. */
  sandboxToken(workspaceId: WorkspaceId, agentId: AgentId): string;
  /** Validate + decode a sandbox token. */
  validateSandboxToken(token: string): { workspaceId: WorkspaceId; agentId: AgentId } | null;
}
