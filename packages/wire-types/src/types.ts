import type {
  AgentInitialConfig,
  GrantableOperation,
  SkillWorkflow,
} from "@houston/protocol";
import type { Agent } from "./agents";
import type { FreeOrg, OrgBilling } from "./org-billing";

export type {
  AgentArrival,
  AgentInitialConfig,
  ConversationImportMessage,
  ConversationImportRequest,
  ConversationImportResult,
  FirstDayOutcome,
  FirstDayRefusalCode,
  FirstDayStartInput,
  FirstDayStartResult,
  GrantableOperation,
  RoutineAccountFailureCode,
  RoutineAutoPause,
  RoutineDeliveryFailure,
  RoutineDeliveryFailureCode,
  RoutineRunFailure,
  RoutineRunFailureCode,
  RoutineSnooze,
  SkillWorkflow,
  SkillWorkflowStep,
} from "@houston/protocol";

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
  chatHistoryMigrated?: boolean;
}

export interface AssistantHandle {
  agent: string;
  conversation: string;
}

export type CustomIntegrationScope = "host" | "agent";

export interface Capabilities {
  officePreview?: boolean;
  push?: boolean;
  localModelBridge?: { versions: number[] };
  profile: "local" | "cloud";
  revealInOs: boolean;
  terminal: boolean;
  tunnel: boolean;
  codeExecution: "local-bash" | "remote-sandbox" | "disabled";
  providers: string[];
  openaiCompatible: boolean;
  integrations: string[];
  sharedSkills: boolean;
  agentDelegation?: boolean;
  customIntegrationOAuth?: boolean;
  customIntegrationScope?: CustomIntegrationScope;
  multiplayer?: boolean;
  role?: OrgRole;
  teams?: boolean;
  spaces?: boolean;
  triggers?: boolean;
  apiKeys?: boolean;
  computeUsage?: boolean;
  plan?: boolean;
  teamBilling?: boolean;
  workspaceDelete?: boolean;
  agentConfigLibrary?: boolean;
  integrationSessionSink?: boolean;
  missionTitleOnSend?: boolean;
  conversationPrewarm?: boolean;
  heartbeat?: boolean;
  linkedinShare?: boolean;
}

export type OrgRole = "owner" | "admin" | "user";

export interface OrgMember {
  userId: string;
  email?: string;
  role: OrgRole;
  displayName?: string;
  photoUrl?: string;
}

export interface UserProfile {
  displayName?: string;
  photoUrl?: string;
}

export interface UserProfilesResult {
  profiles: Record<string, UserProfile>;
}

export interface EditableProfileCustom {
  displayName: boolean;
  photoUrl: boolean;
}

export interface EditableProfile {
  displayName?: string;
  photoUrl?: string;
  custom: EditableProfileCustom;
}

export interface EditableProfileUpdate {
  displayName?: string | null;
  photoUrl?: string | null;
}

export interface OrgPerson {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

export interface MessageMention {
  userId: string;
  name?: string;
}

export interface MessageApproval {
  requestId: string;
  decision: "approve" | "deny";
}

export type AgentAccess = "manager" | "user";

export interface AgentAssignment {
  userId: string;
  access: AgentAccess;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  members?: OrgMember[];
  invites?: OrgInvite[];
}

export interface AddOrgMemberResult {
  userId?: string;
  role: OrgRole;
  invited?: boolean;
  email?: string;
}

export interface BillingSummary {
  plan: "team" | "enterprise";
  status: "free" | "trialing" | "active" | "past_due" | "expired";
  trialEndsAt?: string;
  seats: number;
  interval?: "monthly" | "annual";
}

export interface BillingCheckout {
  url: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  role: OrgRole;
  memberCount: number;
  degraded: boolean;
  billing: OrgBilling | null;
}

export interface OrgInviteSummary {
  id: string;
  orgName: string;
  role: OrgRole;
  invitedBy?: string;
}

export interface OrgsList {
  orgs: OrgSummary[];
  invites: OrgInviteSummary[];
  freeOrg: FreeOrg | null;
}

export interface AgentMoveStart {
  moveId: string;
}

export interface AgentMoveStatus {
  status: "moving" | "done" | "failed";
  error?: string;
}

export interface AgentSettings {
  allowedToolkits: string[] | null;
  access: AgentAccess;
  allowedModels: string[] | null;
}

export type AgentEffortLevel = "low" | "medium" | "high" | "xhigh";

export interface AgentModelChoice {
  provider: string;
  model: string;
  effort?: AgentEffortLevel;
}

export interface AgentModelChoiceInfo {
  choice: AgentModelChoice | null;
  allowedModels: string[] | null;
}

export interface AuditEntry {
  id: number;
  orgId: string;
  actor: string;
  action: string;
  agentSlug?: string;
  subject: unknown;
  createdAt: number;
}

export interface UsageRow {
  agentSlug: string;
  userId: string;
  day: string;
  messages: number;
}

export interface ComputeUsageRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

export interface ComputeUsage {
  asOf: string;
  awakeNow: string[];
  rows: ComputeUsageRow[];
}

export type WorkspaceKind = "personal" | "org";

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  kind?: WorkspaceKind;
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

export type {
  SidebarGroup,
  SidebarLayout,
  SidebarRootEntry,
} from "@houston/protocol";

export * from "./routine-runs";
export * from "./routines";

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
  date_modified?: number;
  date_created?: number;
}

export interface InstalledConfig {
  config: unknown;
  path: string;
}

export interface SkillSummary {
  name: string;
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  category: string | null;
  featured: boolean;
  integrations: string[];
  image: string | null;
  setupActivityId?: string | null;
  inputs: SkillInputDef[];
  promptTemplate: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  options?: string[];
}

export interface SkillDetail {
  name: string;
  title: string | null;
  description: string;
  version: number;
  content: string;
  workflow?: SkillWorkflow | null;
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

export interface SkillsManifest {
  version: 1;
  enabled: string[];
}

export type CliInstallSource = "bundled" | "managed" | "path" | "missing";
export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

export type CredentialScope = "personal" | "team";

export type ProviderHealth =
  | "connected"
  | "not_connected"
  | "needs_reconnect"
  | "out_of_credits"
  | "unreachable";

export interface ProviderStatus {
  provider: string;
  cliInstalled: boolean;
  authState: ProviderAuthState;
  cliName: string;
  installSource: CliInstallSource;
  cliPath: string | null;
  activeModel?: string;
  credentialScope?: CredentialScope;
  health?: ProviderHealth;
  reconnectBy?: number;
}

export type ProviderUsageWindowId =
  | "session"
  | "week"
  | "week_opus"
  | "month"
  | "premium"
  | "chat"
  | "completions";

export interface ProviderUsageWindow {
  id: ProviderUsageWindowId;
  usedPercent: number;
  resetsAt: string | null;
  windowMinutes?: number;
}

export interface ProviderUsageCredits {
  remaining: number;
  granted?: number;
  unit: "USD" | "credits";
}

export interface ProviderUsageTokens {
  inputTokens: number;
  outputTokens: number;
  turns: number;
  since: string;
}

export type ProviderUsageStatus =
  | "ok"
  | "unsupported"
  | "unauthenticated"
  | "error";

export interface ProviderUsage {
  provider: string;
  status: ProviderUsageStatus;
  windows: ProviderUsageWindow[];
  credits?: ProviderUsageCredits;
  tokens?: ProviderUsageTokens;
  plan?: string;
  fetchedAt?: string;
  message?: string;
}

export interface PreferenceValue {
  value: string | null;
}

export type KnownPreferenceKey =
  | "timezone"
  | "locale"
  | "migration_reconnect_dismissed";

export const MIGRATION_RECONNECT_DISMISSED_KEY =
  "migration_reconnect_dismissed";

export interface InstallFromGithub {
  githubUrl: string;
}

export interface ImportedWorkspace {
  workspaceId: string;
  workspaceName: string;
  agentIds: string[];
}

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

export interface SessionStartRequest {
  sessionKey: string;
  prompt: string;
  displayText?: string;
  systemPrompt?: string;
  source?: string;
  workingDir?: string;
  provider?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
  suppressUserBubble?: boolean;
  queuedPreview?: { text: string; attachmentNames?: string[] };
  autoResume?: boolean;
  author?: { userId: string; name?: string };
  mentions?: MessageMention[];
  approvals?: MessageApproval[];
  missionTitle?: MissionTitle;
  grants?: GrantableOperation[];
}

export interface MissionTitle {
  fallback: string;
  text: string;
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
  author?: { userId: string; name?: string };
  mentions?: MessageMention[];
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

export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  status?: number;
  platform?: string;
  detail?: string;
}

export interface ClaudeStatus {
  installed: boolean;
  installPath: string;
  pinnedVersion: string | null;
  installedVersion: string | null;
  lastInstallError: ClaudeInstallError | null;
}

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
  redirectUrl: string | null;
}

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
  promptExcerpt: string;
  schedule?: string;
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

export interface PortableExportMeta {
  agentId: string;
  agentName: string;
  description?: string | null;
  exporter?: string | null;
  anonymized: boolean;
}

export interface PortableExportRequest {
  selection: PortableExportSelection;
  meta: PortableExportMeta;
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

export interface MigrationImportOptions {
  overwrite?: boolean;
  sessions?: boolean;
}

export interface MigrationImportResult {
  written: number;
  skipped: number;
  rejected: { path: string; reason: string }[];
  sessionsRebuilt: boolean;
}

export interface MigrationCounts {
  written: number;
  skipped: number;
  rejected: number;
  sessionsRebuilt: boolean;
}

export interface MigrationSource {
  workspace: string;
  agent: string;
}

export interface MigrationMarker {
  completedAt: string;
  source: MigrationSource | null;
  counts: MigrationCounts | null;
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
  config?: AgentInitialConfig;
}

export interface PortableInstalledAgent {
  agentPath: string;
  agentName: string;
  workspaceName: string;
  requiredIntegrations: string[];
  routineIds: Record<string, string>;
  agent: Agent;
}

export interface IntegrationProviderStatus {
  provider: string;
  ready: boolean;
  reason?: "signin";
  reconnect?: boolean;
}
export interface IntegrationToolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
  noAuth?: boolean;
}
export interface IntegrationConnection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
  accountLabel?: string;
  createdAt?: string;
}

export interface CustomAuthField {
  variable: string;
  label: string;
}

export interface CustomAuthMethod {
  template: string;
  label: string;
  fields: CustomAuthField[];
}

export type CustomIntegrationState =
  | { status: "active"; toolCount: number }
  | { status: "pending"; authMethods: CustomAuthMethod[] }
  | { status: "error"; message: string };

export interface CustomToolInfo {
  name: string;
  description?: string;
}

export interface CustomDetectResult {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  requiresAuthentication?: boolean;
  requiresOAuth?: boolean;
  oauthSupported?: boolean;
  toolCount?: number;
}

export type AddCustomIntegrationInput =
  | {
      kind: "openapi";
      name: string;
      url?: string;
      spec?: string;
      baseUrl?: string;
      website?: string;
      auth: "none" | "credential";
      slug?: string;
      replace?: boolean;
    }
  | {
      kind: "mcp";
      name: string;
      endpoint: string;
      website?: string;
      headers?: Record<string, string>;
      auth: "none" | "credential" | "oauth";
      slug?: string;
      replace?: boolean;
    };

export interface CustomIntegrationView {
  slug: string;
  name: string;
  website?: string;
  kind: "openapi" | "mcp";
  auth?: "none" | "credential" | "oauth";
  displayUrl?: string;
  iconUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  authMethods?: CustomAuthMethod[];
  verified?: boolean;
}

export interface TriggerType {
  slug: string;
  name: string;
  description?: string;
  type: "poll" | "webhook";
  config: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface WebhookKeyReveal {
  url: string;
  secret: string;
  key_prefix: string;
}

export interface CustomEndpoint {
  bridge?: import("@houston/protocol").ManagedBridgeEndpoint;
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  shared?: boolean;
  apiKey?: string;
}
