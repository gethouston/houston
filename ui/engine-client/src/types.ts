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
  /**
   * True when this install carried over a legacy Rust-desktop chat-history db,
   * i.e. the user is migrating from the old desktop build. The desktop UI uses
   * this to show its one-time "reconnect your AI" moment, because the migrated
   * provider credentials are not portable. Absent on engines that predate the
   * field (treat as `false`).
   */
  chatHistoryMigrated?: boolean;
}

export interface Capabilities {
  profile: "local" | "cloud";
  revealInOs: boolean;
  terminal: boolean;
  tunnel: boolean;
  codeExecution: "local-bash" | "remote-sandbox" | "disabled";
  providers: string[];
  openaiCompatible: boolean;
  integrations: string[];
  /**
   * Whether this deployment runs in multiplayer (paid org) mode: members,
   * roles, per-agent assignment. Absent/false = single personal workspace.
   * Optional so every existing single-player host/profile stays valid.
   */
  multiplayer?: boolean;
  /** The current user's role in the org, when `multiplayer` is on. */
  role?: OrgRole;
}

// ---------- Org / roles (multiplayer) ----------

/**
 * A member's authority inside a multiplayer org. `owner` is the billing/root
 * seat, `admin` manages members + agents, `user` is a plain seat that can only
 * use the agents assigned to them. Kept in sync (by hand) with the protocol
 * `OrgRole` — the engine side is the source of truth.
 */
export type OrgRole = "owner" | "admin" | "user";

/** One member of the current user's org. */
export interface OrgMember {
  userId: string;
  /** The member's email, when the host exposes it to the caller. */
  email?: string;
  role: OrgRole;
}

/**
 * The current user's org, with the caller's own role. `members` is populated
 * only for callers allowed to see the roster (owner/admin); a plain `user`
 * gets just the identity fields.
 */
export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  members?: OrgMember[];
}

// ---------- Workspaces ----------

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  /**
   * Optional per-workspace UI-locale override (BCP-47 base tag: `en`/`es`/`pt`).
   * Absent/null means the workspace inherits the global `locale` preference.
   */
  locale?: string | null;
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

export interface WorkspaceContext {
  workspace: string;
  user: string;
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
  /**
   * Multiplayer only: whether the CURRENT user has been assigned this agent
   * (i.e. may use it). Absent in single-player mode, where every agent is the
   * sole user's. The host computes this per-caller.
   */
  assigned?: boolean;
  /**
   * Multiplayer only: the org-member user ids this agent is assigned to.
   * Empty means "everyone in the org". Absent in single-player mode. Only
   * populated for callers who may manage assignments (owner/admin).
   */
  assignedUserIds?: string[];
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
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
}

export interface NewActivity {
  title: string;
  description?: string;
  agent?: string;
  provider?: string;
  model?: string;
}

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

export interface Routine {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Provider id override (e.g. "anthropic", "openai"); absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override (e.g. "claude-opus-4-8", "gpt-5.5"); absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override (e.g. "high", "max"); absent means inherit the agent's effort. */
  effort?: string | null;
  /**
   * Multiplayer only: the org-member user id that created this routine. Absent
   * in single-player mode. Surfaced so the UI can attribute automations.
   */
  created_by?: string;
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
  /** Defaults to `"shared"` (one chat per routine) when omitted. */
  chat_mode?: RoutineChatMode;
  /** Composio toolkit slugs this routine uses. */
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit to inherit the agent's provider. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit to inherit the agent's model. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit to inherit the agent's effort. */
  effort?: string | null;
}

export interface RoutineUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit or null to leave unchanged. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit or null to leave unchanged. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit or null to leave unchanged. */
  effort?: string | null;
}

export type RoutineRunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  /** Human-readable reset hint while the provider CLI is sleeping on a
   *  usage-limit window. Only meaningful when status is `running`. */
  paused_until?: string;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
  /** Pass `string` to set the hint, `null` to clear, omit to leave alone. */
  paused_until?: string | null;
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
  /** Last modification time in milliseconds since the UNIX epoch. Omitted
   * when the filesystem doesn't expose mtime for the entry. */
  date_modified?: number;
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
  agent?: string;
  routine_id?: string;
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
  /**
   * The provider's currently-configured model id, when the engine reports one.
   * Carries the OpenAI-compatible (local) provider's user-supplied model — which
   * is dynamic and absent from the static frontend catalog — so the model picker
   * can show + select it. Absent for providers whose models live in the catalog.
   */
  activeModel?: string;
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
  | "legal_acceptance"
  | "migration_reconnect_dismissed";

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

/**
 * Preference key marking that the user has seen (and dismissed/completed) the
 * one-time "reconnect your AI" moment shown after migrating from the legacy
 * desktop build. Value is the literal `"1"` once set; absent means not yet
 * shown. Lives in engine preferences so it survives reinstall-in-place.
 */
export const MIGRATION_RECONNECT_DISMISSED_KEY =
  "migration_reconnect_dismissed";

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
  /**
   * When `true`, the engine compacts the conversation (summarize the visible
   * history + reseed a fresh provider session) before running this turn. Set
   * by the desktop client once the context window is nearly full. Honored only
   * when there's an existing session to compact; ignored on the first turn.
   */
  compact?: boolean;
  /**
   * Set when the user switches this conversation to a DIFFERENT provider
   * mid-stream. Provider CLI sessions are not portable, so the engine reseeds
   * a fresh session on the new provider with prior context: the full
   * transcript verbatim (`mode: "replay"`) when it fits the new model's
   * window, or an AI summary (`mode: "summarize"`) when it does not.
   * `fromProvider` is the provider being left. Takes precedence over
   * `compact`; absent for normal turns.
   */
  providerSwitch?: {
    mode: "replay" | "summarize";
    fromProvider: string;
  };
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
  /**
   * Multiplayer only (C5): who wrote a `user_message` entry, carried through to
   * the ui/chat feed so a shared conversation attributes each teammate's bubble.
   * Absent on every other feed type and in single-player mode.
   */
  author?: { userId: string; name?: string };
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

export interface SuggestedIntegration {
  slug: string;
  displayName: string;
}

export interface SuggestedRoutine {
  name: string;
  prompt: string;
  schedule: string;
}

export interface GenerateInstructionsResult {
  name: string;
  instructions: string;
  suggestedIntegrations: SuggestedIntegration[];
  suggestedRoutine?: SuggestedRoutine | null;
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

// ---------- Claude Code installer ----------

/**
 * Stable failure `kind` for a Claude Code install attempt. Mirror of the
 * Rust `ClaudeInstallError` enum in
 * `engine/houston-ui-events/src/lib.rs` (serde `tag = "kind"`,
 * snake_case). The engine is i18n-agnostic, so it emits the slug and the
 * frontend localizes it. The two MUST stay in sync.
 */
export type ClaudeInstallErrorKind =
  | "timeout"
  | "network_unreachable"
  | "download_interrupted"
  | "http_error"
  | "checksum_mismatch"
  | "platform_unsupported"
  | "write_failed"
  | "manifest_missing"
  | "manifest_entry_missing"
  | "unknown";

/**
 * Typed install failure. `kind` is localized by the frontend; the
 * optional fields carry per-kind data. `detail` is technical text for
 * the bug report — never shown to a user verbatim.
 */
export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  /** Present on `http_error`. */
  status?: number;
  /** Present on `platform_unsupported`. */
  platform?: string;
  /** Present on `checksum_mismatch` / `write_failed` / `unknown`. */
  detail?: string;
}

/**
 * Snapshot of the runtime Claude Code install. Returned by
 * `GET /v1/claude/status`.
 *
 * `lastInstallError` is the field the onboarding "Sign in with
 * Anthropic" card reads when `installed` is `false` — it disambiguates
 * "Houston tried to download Claude Code and failed (likely no
 * internet)" from "Houston hasn't tried yet". See issue #231 for the
 * UX bug this addresses.
 */
export interface ClaudeStatus {
  installed: boolean;
  installPath: string;
  pinnedVersion: string | null;
  installedVersion: string | null;
  lastInstallError: ClaudeInstallError | null;
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

export interface ComposioReconnectResponse {
  /**
   * Browser URL the user must open to finish OAuth re-consent, or `null`
   * when the auth scheme refreshed silently (e.g. API-key connections).
   */
  redirectUrl: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Portable agent (share / import "from a friend")
// ────────────────────────────────────────────────────────────────────────

export interface PortableClaudeMdPreview {
  byteCount: number;
  excerpt: string;
}

export interface PortableSkillPreview {
  slug: string;
  description: string;
  category: string | null;
  image: string | null;
  integrations: string[];
  featured: boolean;
}

export interface PortableRoutinePreview {
  id: string;
  name: string;
  description: string;
  promptExcerpt: string;
  schedule: string;
  enabled: boolean;
  integrations: string[];
}

export interface PortableLearningPreview {
  id: string;
  text: string;
  createdAt: string;
}

export interface PortableInventoryPreview {
  claudeMd: PortableClaudeMdPreview | null;
  skills: PortableSkillPreview[];
  routines: PortableRoutinePreview[];
  learnings: PortableLearningPreview[];
}

export interface PortableExportSelection {
  includeClaudeMd: boolean;
  includeSkillSlugs: string[];
  includeRoutineIds: string[];
  includeLearningIds: string[];
}

export interface PortableRoutineFieldOverride {
  name?: string | null;
  description?: string | null;
  prompt?: string | null;
}

export interface PortableExportOverrides {
  claudeMd?: string | null;
  skillBodies?: Record<string, string>;
  routineFields?: Record<string, PortableRoutineFieldOverride>;
  learningTexts?: Record<string, string>;
}

export interface PortableExportMeta {
  agentId: string;
  agentName: string;
  description?: string | null;
  exporter?: string | null;
  anonymized: boolean;
}

export interface PortableExportRequest {
  selection: PortableExportSelection;
  overrides?: PortableExportOverrides;
  meta: PortableExportMeta;
}

export interface PortableAnonymizeRequest {
  claudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

export interface PortableAnonymizedString {
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
}

export interface PortableAnonymizedItem {
  id: string;
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
}

export interface PortableRoutineFieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface PortableAnonymizedRoutine {
  id: string;
  fieldDiffs: PortableRoutineFieldDiff[];
  overridePayload: PortableRoutineFieldOverride;
}

export interface PortableAnonymizeResponse {
  claudeMd: PortableAnonymizedString | null;
  skills: PortableAnonymizedItem[];
  routines: PortableAnonymizedRoutine[];
  learnings: PortableAnonymizedItem[];
}

export interface PortableManifestSummary {
  agentId: string;
  agentName: string;
  description: string | null;
  exporter: string | null;
  houstonVersion: string;
  createdAt: string;
  anonymized: boolean;
  formatVersion: number;
}

export interface PortableUploadPreviewResponse {
  packageId: string;
  manifest: PortableManifestSummary;
  preview: PortableInventoryPreview;
}

export type PortableScanCategory =
  | "exfiltration"
  | "prompt_injection"
  | "tool_abuse"
  | "suspicious_shell"
  | "external_callback";
export type PortableScanSeverity = "low" | "medium" | "high";
export type PortableScanItemKind =
  | "claude_md"
  | "skill"
  | "routine"
  | "learning";

export interface PortableScanFinding {
  category: PortableScanCategory;
  severity: PortableScanSeverity;
  excerpt: string;
  why: string;
}

export interface PortableScanItem {
  kind: PortableScanItemKind;
  id: string;
  findings: PortableScanFinding[];
}

export interface PortableScanResponse {
  disclaimer: string;
  items: PortableScanItem[];
}

export interface PortableInstallSelection {
  includeClaudeMd: boolean;
  includeSkillSlugs: string[];
  includeRoutineIds: string[];
  includeLearningIds: string[];
}

export interface PortableInstallRequest {
  packageId: string;
  workspaceName: string;
  agentName: string;
  agentColor?: string | null;
  selection: PortableInstallSelection;
}

export interface PortableInstalledAgent {
  agentPath: string;
  agentName: string;
  workspaceName: string;
  requiredIntegrations: string[];
}

// ── integrations (Composio, platform mode) ───────────────────────────────────
// User-level: no provider account — the user only connects apps (Gmail, Slack…)
// via OAuth; Houston's platform key lives server-side, keyed by the user's id.

export interface IntegrationProviderStatus {
  provider: string;
  /** False on desktop until the user signs in to Houston (gateway needs it). */
  ready: boolean;
  reason?: "signin";
  /**
   * Legacy "Composio for you" connections were found for this install: the
   * user reconnects their apps once (framed as the security improvement it is
   * — their personal long-lived key is no longer used anywhere).
   */
  reconnect?: boolean;
}
export interface IntegrationToolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
}
export interface IntegrationConnection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
}

// ── OpenAI-compatible (local) provider ───────────────────────────────────────
// A local LLM server the user runs (Ollama / vLLM / LM Studio), connected by
// base URL + model id. New-engine + desktop only (the URL is the user's own
// machine). The key is optional — keyless local servers ignore it.
export interface CustomEndpoint {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  apiKey?: string;
}
