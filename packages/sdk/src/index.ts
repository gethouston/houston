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
export type { ModuleContext } from "./module-context";
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
  type AgentCreateInput,
  type AgentListItem,
  AgentsCommand,
  type AgentsCommandType,
  AgentsHttpError,
  type AgentsModule,
  type AgentsViewModel,
  type AgentsWrites,
  type WireAgent,
} from "./modules/agents";
// ===== Conversations module contract ===================================
export {
  type ConversationListItem,
  type ConversationListVM,
  conversationListScope,
} from "./modules/conversations";
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
// ===== Mission-search module contract ==================================
export type {
  MatchedIn,
  MissionMatch,
  MissionsSearchModule,
} from "./modules/missions-search";
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
  type FeedFrame,
  type FeedItemVM,
  type FeedOutput,
  historyToFeed,
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
