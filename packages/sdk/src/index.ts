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
export type {
  CommandEnvelope,
  CommandHandler,
  CommandResult,
} from "./commands";
export { CommandRegistry, isCommandEnvelope } from "./commands";
export type { ModuleContext } from "./module-context";
// ===== Agents module contract ==========================================
export {
  AGENTS_CHANGED_EVENT,
  AGENTS_SCOPE,
  type AgentListItem,
  AgentsCommand,
  type AgentsCommandType,
  AgentsHttpError,
  type AgentsModule,
  type AgentsViewModel,
  type WireAgent,
} from "./modules/agents";
// ===== Conversations module contract ===================================
export {
  type ConversationListItem,
  type ConversationListVM,
  conversationListScope,
} from "./modules/conversations";
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
  type BoardStatus,
  type ConversationVM,
  conversationScope,
  type FeedItemVM,
  type FeedOutput,
  isNotConnectedError,
  isStoppedByUser,
  MultiplexFeedOutput,
  observeConversation,
  SEND_IN_FLIGHT_MESSAGE,
  type SessionStatusValue,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
  type StreamTuning,
  type StreamTurnOptions,
  streamTurn,
  type TerminalBoardStatus,
  TURN_DIED_MESSAGE,
  type TurnCancelInput,
  type TurnObserveInput,
  type TurnSendInput,
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
