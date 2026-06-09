import type { Agent, AgentId, UserId, Workspace, WorkspaceId } from "./domain/types";

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
  /** A workspace by id — the SandboxManager needs its slug for the K8s namespace. */
  getWorkspace(id: WorkspaceId): Promise<Workspace | null>;

  getAgent(id: AgentId): Promise<Agent | null>;
  /** All agents in a workspace (the owner sees every one). */
  listAgents(workspaceId: WorkspaceId): Promise<Agent[]>;
  /** Every workspace (admin/operator only — the dashboard enumerates all tenants). */
  listWorkspaces(): Promise<Workspace[]>;
  /** Every agent across all workspaces (admin/operator only). */
  listAllAgents(): Promise<Agent[]>;
  createAgent(input: { workspaceId: WorkspaceId; name: string }): Promise<Agent>;
  renameAgent(id: AgentId, name: string): Promise<Agent>;
  deleteAgent(id: AgentId): Promise<void>;
}

/** Verifies a caller's bearer token and resolves it to a principal. */
export interface TokenVerifier {
  /** Returns the principal's user id, or null if the token is invalid/expired. */
  verify(bearer: string): Promise<{ userId: UserId } | null>;
}

/** Where an agent's sandbox can be reached once it is awake. */
export interface SandboxEndpoint {
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

export type SandboxState = "running" | "asleep" | "absent";

/** Lifecycle of an agent's isolated sandbox on GKE. Impls: FakeSandboxManager, GkeSandboxManager. */
export interface SandboxManager {
  /** Ensure the agent's sandbox is running (spawn or wake it). Returns where to reach it. */
  ensureAwake(agent: Agent): Promise<SandboxEndpoint>;
  /** Sleep the sandbox (scale to zero), persisting its volume. */
  sleep(agentId: AgentId): Promise<void>;
  /** Permanently delete the sandbox. Keeps the volume unless dropVolume. */
  destroy(agentId: AgentId, opts?: { dropVolume?: boolean }): Promise<void>;
  status(agentId: AgentId): Promise<SandboxState>;
}

/**
 * The user's OWN AI subscription credential for a workspace (connect-once): the
 * OAuth tokens obtained when they connect, held centrally so every agent in the
 * workspace shares one connection and the control plane is the single refresher.
 */
export interface WorkspaceCredential {
  workspaceId: WorkspaceId;
  /** "openai-codex" | "anthropic". */
  provider: string;
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms the access token expires. */
  expiresAt: number;
  /** The ChatGPT account id (codex) — the backend needs it; preserved across refreshes. */
  accountId?: string;
}

/** Stores + serves the one connect-once credential per (workspace, provider). */
export interface CredentialStore {
  get(workspaceId: WorkspaceId, provider: string): Promise<WorkspaceCredential | null>;
  /** Upsert (overwrite in place on refresh). */
  put(cred: WorkspaceCredential): Promise<void>;
  remove(workspaceId: WorkspaceId, provider: string): Promise<void>;
}

/** Per-workspace provider credentials, held only here (Secret Manager in prod). */
export interface CredentialVault {
  /** The real provider key for a workspace, injected by the keyless proxy. Never leaves the control plane. */
  realKeyFor(workspaceId: WorkspaceId, provider: string): Promise<string | null>;
  /** Mint the non-secret token a sandbox carries to the proxy. */
  sandboxToken(workspaceId: WorkspaceId, agentId: AgentId): string;
  /** Validate + decode a sandbox token presented to the proxy. */
  validateSandboxToken(token: string): { workspaceId: WorkspaceId; agentId: AgentId } | null;
}
