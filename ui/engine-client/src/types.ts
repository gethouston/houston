/**
 * Wire types mirroring `engine/houston-engine-protocol/src/lib.rs` and
 * domain DTOs from `engine/houston-engine-core`.
 *
 * Until we wire up a Rust→TS code generator (`ts-rs` or `specta`) these
 * are maintained by hand. Keep them in sync — the Rust side is the
 * source of truth.
 */

export const PROTOCOL_VERSION = 1 as const;

export type EnvelopeKind = "event" | "req" | "res" | "ping" | "pong";

export interface EngineEnvelope<P = unknown> {
  v: number;
  id: string;
  kind: EnvelopeKind;
  ts: number;
  payload: P;
}

export type ClientRequest =
  | { op: "sub"; topics: string[] }
  | { op: "unsub"; topics: string[] };

export interface LagMarker {
  type: "Lag";
  dropped: number;
}

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "VERSION_MISMATCH";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  protocol: number;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
  build: string | null;
}

// ---------- Workspaces ----------

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  provider?: string;
  model?: string;
}

export interface CreateWorkspace {
  name: string;
  provider?: string;
  model?: string;
}

export interface RenameWorkspace {
  newName: string;
}

export interface UpdateProvider {
  provider: string;
  model?: string;
}

// ---------- Workspace-scoped agent CRUD ----------

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}

// ---------- Agents / agent-data files ----------

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  updated_at?: string;
  provider?: string;
  model?: string;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
}

export interface NewActivity {
  title: string;
  description?: string;
  agent?: string;
  worktree_path?: string;
  provider?: string;
  model?: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  suppress_when_silent: boolean;
  /** IANA timezone override; absent means use the user's preference. */
  timezone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  description?: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  /** IANA timezone override (e.g. "America/Bogota"). Falls back to user pref. */
  timezone?: string | null;
}

export interface RoutineUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  /** Set to a string to override, `null` to clear, omit to leave unchanged. */
  timezone?: string | null;
}

export type RoutineRunStatus = "running" | "silent" | "surfaced" | "error";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
}

export interface ProjectConfig {
  name?: string;
  provider?: string;
  model?: string;
  effort?: string;
  [extra: string]: unknown;
}

export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
}

export interface InstalledConfig {
  config: unknown;
  path: string;
}

// ---------- Conversations ----------

export interface ConversationEntry {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: string;
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
}

// ---------- Skills ----------

export interface SkillSummary {
  name: string;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  /** Optional user-facing category. Drives grouping in the "New mission" picker. */
  category: string | null;
  /** Surface this skill on the Featured tab of the "New mission" picker. */
  featured: boolean;
  /** Composio toolkit slugs this skill touches (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Image URL or Microsoft Fluent 3D Emoji slug (e.g. "rocket"). */
  image: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  promptTemplate: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  /** Options for `type: select`. Empty for text/textarea. */
  options?: string[];
}

export interface SkillDetail {
  name: string;
  description: string;
  version: number;
  content: string;
}

export interface CreateSkillRequest {
  workspacePath: string;
  name: string;
  description: string;
  content: string;
}

export interface SaveSkillRequest {
  workspacePath: string;
  content: string;
}

export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface InstallFromRepoRequest {
  workspacePath: string;
  source: string;
  skills: RepoSkill[];
}

export interface InstallCommunityRequest {
  workspacePath: string;
  source: string;
  skillId: string;
}

export interface CommunitySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

// ---------- Providers / preferences ----------

/**
 * Where Houston found the CLI binary backing a provider. Surfaced so
 * the UI can label whether the user is talking to a copy Houston shipped
 * (`bundled`), one Houston downloaded for them (`managed`), one already
 * on their PATH (`path`), or nothing at all (`missing`).
 *
 * Mirrors the Rust `houston_engine_core::provider::InstallSource` enum
 * with `#[serde(rename_all = "lowercase")]`.
 */
export type CliInstallSource = "bundled" | "managed" | "path" | "missing";
export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

export interface ProviderStatus {
  provider: string;
  cliInstalled: boolean;
  authState: ProviderAuthState;
  cliName: string;
  installSource: CliInstallSource;
  /** Absolute path to the CLI binary that will be spawned, or `null`
   *  when `installSource === "missing"`. Useful for diagnostics UI. */
  cliPath: string | null;
}

export interface PreferenceValue {
  value: string | null;
}


/**
 * Known preference keys. Free-form strings are still allowed — this alias
 * just documents the well-known keys and gives consumers completion.
 *
 * Keep in sync with `houston-engine-core::preferences` constants.
 */
export type KnownPreferenceKey =
  | "timezone"
  | "locale"
  | "legal_acceptance";

/**
 * Persisted record that the user has accepted a given version of the
 * in-app security disclaimer. Stored as the JSON-encoded value of the
 * `"legal_acceptance"` preference. The frontend re-prompts whenever the
 * stored `version` is lower than the current in-app constant.
 */
export interface LegalAcceptance {
  version: number;
  /** RFC3339 timestamp captured at the moment of acceptance. */
  acceptedAt: string;
}

/** Preference key for the JSON-encoded [`LegalAcceptance`]. */
export const LEGAL_ACCEPTANCE_KEY = "legal_acceptance";

// ---------- Store ----------

export interface StoreListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  icon_url: string;
  integrations?: string[];
  repo: string;
  installs: number;
  registered_at: string;
  version?: string;
  content_hash?: string;
  bundled?: boolean;
}

export interface InstallAgent {
  repo: string;
  agentId: string;
}

export interface InstallFromGithub {
  githubUrl: string;
}

export interface ImportedWorkspace {
  workspaceId: string;
  workspaceName: string;
  agentIds: string[];
}

// ---------- Tunnel (mobile pairing + paired-device management) ----------

export interface TunnelStatus {
  connected: boolean;
  tunnelId: string | null;
  publicHost: string | null;
  lastActivityMs: number | null;
}

export interface PairingCode {
  /** Full code mobile must send to `{relay}/pair/<code>` — already
   * prefixed with `tunnelId-`. Do not split on the dash before sending.
   */
  code: string;
  accessSecret: string;
  rotatedAt: string;
}

// ---------- Push (mobile notification registration) ----------

export interface PushRegisterRequest {
  deviceToken: string;
  platform: "apns" | "fcm";
  installationId?: string;
  appVersion?: string;
  appEnv?: "prod" | "sandbox";
}

// ---------- Worktree / shell ----------

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

export interface CreateWorktreeRequest {
  repoPath: string;
  name: string;
  branch?: string;
}

export interface ListWorktreesRequest {
  repoPath: string;
}

export interface RemoveWorktreeRequest {
  repoPath: string;
  worktreePath: string;
}

export interface RunShellRequest {
  path: string;
  command: string;
}

// ---------- Sessions ----------

export interface SessionStartRequest {
  sessionKey: string;
  prompt: string;
  systemPrompt?: string;
  source?: string;
  workingDir?: string;
  provider?: string;
  model?: string;
  /**
   * Reasoning-effort override. Forwarded to the CLI as `--effort` (Claude) or
   * `-c model_reasoning_effort=<value>` (Codex). The tutorial uses this to
   * force `"medium"` so a stale global `~/.codex/config.toml` value can't
   * blow up the session.
   */
  effort?: string;
}

export interface SessionStartResponse {
  sessionKey: string;
}

export interface SessionCancelResponse {
  cancelled: boolean;
}

export interface ChatHistoryEntry {
  feed_type: string;
  data: unknown;
}

export interface SummarizeResult {
  title: string;
  description: string;
}

export interface SummarizeOptions {
  agentPath?: string;
  provider?: string;
  model?: string;
}

// ---------- Attachments ----------

export interface AttachmentUploadRequest {
  name: string;
  size: number;
  mime?: string | null;
}

export interface CreateAttachmentUploadsRequest {
  scopeId: string;
  files: AttachmentUploadRequest[];
}

export interface AttachmentUploadTarget {
  id: string;
  name: string;
  size: number;
  uploadUrl: string;
  maxBytes: number;
}

export interface CreateAttachmentUploadsResponse {
  uploads: AttachmentUploadTarget[];
}

export interface AttachmentUploadResult {
  id: string;
  path: string;
  size: number;
  sha256: string;
}

export interface AttachmentManifest extends AttachmentUploadResult {
  scopeId: string;
  originalName: string;
  safeName: string;
  mime?: string | null;
  objectPath: string;
  createdAt: string;
}

// ---------- Composio ----------

export type ComposioStatus =
  | { status: "not_installed" }
  | { status: "needs_auth" }
  | { status: "ok"; email: string | null; org_name: string | null }
  | { status: "error"; message: string };

export interface ComposioAppEntry {
  toolkit: string;
  name: string;
  description: string;
  logo_url: string;
  categories: string[];
}

export interface ComposioStartLoginResponse {
  login_url: string;
  cli_key: string;
}

export interface ComposioStartLinkResponse {
  redirect_url: string;
  connected_account_id: string;
  toolkit: string;
}
