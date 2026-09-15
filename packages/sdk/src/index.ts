/**
 * `@houston/sdk` — the single headless Houston client.
 *
 * One client implementation under every surface (web, desktop, native). Reads
 * flow as scope snapshots; writes flow as commands. See README.md for the model.
 *
 * This barrel is the package's public API: the kernel (`HoustonSdk`, the store,
 * the command registry), the shared auth surface, and each module's CONTRACT —
 * its view-model types, scope helpers, and command constants that a consumer
 * subscribes to and dispatches. The `create<Name>Module` factories are internal
 * (the kernel composes them); a host uses `new HoustonSdk(...)`, not a factory.
 */

// The agent-name rule lives once in @houston/domain; surfaces import it from
// here so they can validate BEFORE submitting instead of rendering the
// server's rejection (HOU-1166).
export {
  AGENT_NAME_MAX_LENGTH,
  type AgentNameValidation,
  type InvalidAgentNameReason,
  validateAgentName,
} from "@houston/domain";
// ===== Kernel =========================================================
export {
  type AuthExpiryNotifier,
  createAuthExpiryNotifier,
  isUnauthorized,
  TOKEN_EXPIRED_EVENT,
} from "./auth-expiry";
// ===== Native bridge (dispatcher + wire vocabulary) ====================
// The JS-side dispatcher that implements `BRIDGE.md` for embedding hosts
// (iOS/JavaScriptCore, Android/Hermes). The self-contained IIFE bundle entry
// lives in `bridge/entry.ts` (built via `build:bridge`) and is NOT re-exported
// here because it installs global shims as an import side effect.
export {
  type Bridge,
  createBridge,
  type SdkFactory,
} from "./bridge/dispatcher";
export {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeInbound,
  type BridgeLogLevel,
  type BridgeOutbound,
  type NativePorts,
  type SendFn,
} from "./bridge/wire";
export type {
  CommandEnvelope,
  CommandHandler,
  CommandResult,
} from "./commands";
export { CommandRegistry, isCommandEnvelope } from "./commands";
export * from "./local-model-bridge";
export type { ModuleContext } from "./module-context";
// ===== Account module contract =========================================
export {
  AccountCommand,
  type AccountCommandType,
  AccountHttpError,
  type AccountModule,
  type ApiKey,
  type ApiKeyCreated,
  type EditableProfile,
  type EditableProfileCustom,
  type EditableProfileUpdate,
} from "./modules/account";
// ===== Activities module contract ======================================
export {
  ACTIVITY_CHANGED_EVENT,
  ACTIVITY_STATUSES,
  ActivitiesCommand,
  type ActivitiesCommandType,
  ActivitiesHttpError,
  type ActivitiesModule,
  type ActivitiesViewModel,
  type ActivitiesWrites,
  type ActivityItem,
  activitiesScope,
  type CreatedActivity,
} from "./modules/activities";
// ===== Agents module contract ==========================================
export {
  AGENTS_CHANGED_EVENT,
  AGENTS_SCOPE,
  type AgentAccess,
  type AgentAssignment,
  type AgentCreateInput,
  type AgentListItem,
  type AgentsAccount,
  AgentsCommand,
  type AgentsCommandType,
  AgentsHttpError,
  type AgentsLibrary,
  type AgentsModule,
  type AgentsViewModel,
  type AgentsWrites,
  type InstalledConfig,
  type WireAgent,
} from "./modules/agents";
// ===== Conversations module contract ===================================
export {
  type ConversationListItem,
  type ConversationListVM,
  conversationListScope,
} from "./modules/conversations";
// ===== Files module contract ===========================================
export {
  FilesCommand,
  type FilesCommandType,
  FilesHttpError,
  type FilesModule,
  type FileUpload,
  type ProjectFile,
} from "./modules/files";
// ===== Integrations module contract ====================================
export {
  type ConnectResult,
  INTEGRATIONS_SCOPE,
  type IntegrationConnection,
  IntegrationsCommand,
  type IntegrationsCommandType,
  type IntegrationsModule,
  type IntegrationsUnavailableReason,
  type IntegrationsViewModel,
  type IntegrationsWrites,
  type IntegrationToolkit,
} from "./modules/integrations";
export type {
  AddCustomIntegrationInput,
  CustomAuthField,
  CustomAuthMethod,
  CustomDetectResult,
  CustomIntegrationDetails,
  CustomIntegrationState,
  CustomIntegrationView,
  CustomToolInfo,
} from "./modules/integrations/custom-types";
export type { TriggerType } from "./modules/integrations/reads";
export { IntegrationsHttpError } from "./modules/integrations/transport";
// ===== Mission-search module contract ==================================
export type {
  MatchedIn,
  MissionMatch,
  MissionsSearchModule,
} from "./modules/missions-search";
// ===== Org module contract =============================================
export {
  type AddOrgMemberResult,
  type AuditEntry,
  type ComputeUsage,
  type ComputeUsageRow,
  ORG_ROLES,
  OrgCommand,
  type OrgCommandType,
  OrgHttpError,
  type OrgInfo,
  type OrgInvite,
  type OrgMember,
  type OrgModule,
  type OrgPerson,
  type UsageRow,
  type UserProfile,
  type UserProfilesResult,
} from "./modules/org";
// ===== Preferences module contract =====================================
export {
  PreferencesCommand,
  type PreferencesCommandType,
  type PreferencesModule,
} from "./modules/preferences";
// ===== Providers module contract =======================================
export {
  type AuthStatus,
  type CustomEndpoint,
  type LoginInfo,
  type LoginOptions,
  type LoginState,
  mergeProviders,
  overlayStatus,
  type ProviderId,
  ProvidersCommand,
  type ProvidersCommandType,
  type ProvidersModule,
  type ProvidersViewModel,
  type ProvidersWrites,
  type ProviderVM,
  providersScope,
  type SetModelOptions,
} from "./modules/providers";
// ===== Routines module contract ========================================
export {
  type NewRoutine,
  type Routine,
  type RoutineRun,
  RoutinesCommand,
  type RoutinesCommandType,
  RoutinesHttpError,
  type RoutinesModule,
  type RoutineUpdate,
  type WebhookKeyReveal,
} from "./modules/routines";
// ===== Session module contract =========================================
// `createAuthFetch` + `SESSION_TOKEN_KEY` are host-facing: the host composes the
// auth-fetch into `ports.fetch` before constructing the SDK (see the module).
export {
  CONNECTION_SCOPE,
  type ConnectionStatus,
  type ConnectionViewModel,
  createAuthFetch,
  SESSION_TOKEN_KEY,
  SET_TOKEN_COMMAND,
  type SessionModule,
  type SetTokenPayload,
} from "./modules/session";
// ===== Skills module contract ==========================================
export {
  AgentSkillsCommand,
  type AgentSkillsCommandType,
  type AgentSkillsFacade,
  AgentSkillsHttpError,
  type HostSkillSummary,
  type NewSkill,
  type SkillDetail,
  type SkillInputDef,
  type SkillSummary,
  type SkillsManifest,
  type SkillsModule,
} from "./modules/skills";
// ===== Skills marketplace contract =====================================
export {
  type CommunitySkill,
  type CommunitySkillPreview,
  MarketplaceCommand,
  type MarketplaceCommandType,
  MarketplaceHttpError,
  type RepoSkill,
  type SkillsMarketplace,
} from "./modules/skills/types-marketplace";
// ===== Shared skills contract ==========================================
export {
  type NewSharedSkill,
  type SharedSkillDiagnostic,
  type SharedSkillInput,
  type SharedSkillSummary,
  SharedSkillsCommand,
  type SharedSkillsCommandType,
  SharedSkillsHttpError,
  type SharedSkillsList,
  type SharedSkillsModule,
} from "./modules/skills/types-shared";
// ===== Spaces module contract ==========================================
export {
  type AgentMoveStart,
  type AgentMoveStatus,
  type BillingSummary,
  type OrgInviteSummary,
  type OrgRole,
  type OrgSummary,
  type OrgsList,
  SpacesCommand,
  type SpacesCommandType,
  SpacesHttpError,
  type SpacesModule,
} from "./modules/spaces";
// ===== Teams module contract ===========================================
// `AgentAccess`/`AgentAssignment` are the agents module's; a team assignment
// carries the same value, so they are exported once, under Agents.
export {
  type AgentEffortLevel,
  type AgentModelChoice,
  type AgentModelChoiceInfo,
  type AgentSettings,
  type AgentSettingsUpdate,
  type AgentTeam,
  type AgentTeamInput,
  type AgentTeamMember,
  type AgentTeamPatch,
  TeamsCommand,
  type TeamsCommandType,
  TeamsHttpError,
  type TeamsModule,
  type TriggerStatusItem,
  type TriggerStatusState,
} from "./modules/teams";
// ===== Turns module public surface =====================================
// The turn/feed machinery lives in the turns module; it is re-exported here so
// a host (the web engine-adapter) can drive it with its OWN FeedOutput. The
// typed facade is still reached through `sdk.turns`.
export {
  type AttachmentRef,
  type AttachmentsOperation,
  AttachmentTooLargeError,
  type AttachmentUpload,
  asAttachmentsSaveInput,
  type BoardStatus,
  buildAttachmentText,
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
  type DecodedAttachmentText,
  decodeAttachmentText,
  ENGINE_RESTART_MESSAGE,
  type FeedAuthor,
  type FeedFrame,
  type FeedItemVM,
  type FeedMention,
  type FeedOutput,
  type HistoryWindowVM,
  historyToFeed,
  isEngineWakingRejection,
  isNotConnectedError,
  isStoppedByUser,
  MultiplexFeedOutput,
  observeConversation,
  type PendingInteraction,
  type QueuedMessageVM,
  SEND_IN_FLIGHT_MESSAGE,
  type SessionStatusValue,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
  type StreamTuning,
  type StreamTurnOptions,
  streamKey,
  streamTurn,
  type TerminalBoardStatus,
  TURN_DIED_MESSAGE,
  TURN_FAILED_MESSAGE,
  type TurnAttachmentsSaveInput,
  type TurnAttachmentsSaveResult,
  type TurnCancelInput,
  type TurnHistoryInput,
  type TurnObserveInput,
  type TurnSendInput,
  type TurnWirePin,
  turnErrorMessage,
} from "./modules/turns";
// ===== Workspaces module contract ======================================
export {
  type SidebarGroup,
  type SidebarLayout,
  type Workspace,
  type WorkspaceKind,
  WorkspacesCommand,
  type WorkspacesCommandType,
  WorkspacesHttpError,
  type WorkspacesModule,
} from "./modules/workspaces";
export type {
  Clock,
  KeyValueStore,
  LogFields,
  SdkConfig,
  SdkLogger,
  SdkPorts,
} from "./ports";
export { HoustonSdk } from "./sdk";
export type { EventListener, SdkEvent, SnapshotListener } from "./store";
export { ScopeStore } from "./store";
