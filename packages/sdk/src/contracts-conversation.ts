/**
 * The conversation contract: the conversation list, the turn/feed machinery a
 * host drives with its own `FeedOutput`, and search across missions.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 */
// ===== Conversations module contract ===================================

// ===== Browser hand-off module contract ===============================
export type { BrowserWatchOptions } from "./modules/browser";
export type * from "./modules/browser/types";
export {
  type ConversationListItem,
  type ConversationListVM,
  conversationListScope,
} from "./modules/conversations";
// ===== Mission-search module contract ==================================
export type {
  MatchedIn,
  MissionMatch,
  MissionsSearchModule,
} from "./modules/missions-search";
// ===== Turns module public surface =====================================
// The turn/feed machinery lives in the turns module; it is re-exported here so
// a host (the web engine-adapter) can drive it with its OWN FeedOutput. The
// typed facade is still reached through `sdk.turns`.
export {
  AGENT_SETUP_FAILED_MESSAGE,
  AGENT_TOO_LARGE_MESSAGE,
  type AttachmentRef,
  type AttachmentsOperation,
  AttachmentTooLargeError,
  type AttachmentUpload,
  asAttachmentsSaveInput,
  type BoardPersistOptions,
  type BoardStatus,
  buildAttachmentText,
  COMPUTE_BUSY_MESSAGE,
  type ComposerDraft,
  type ConversationVM,
  ConversationVmOutput,
  classifyImportFailure,
  computeBusyRefusal,
  conversationScope,
  type DecodedAttachmentText,
  type DismissInteractionOutcome,
  decodeAttachmentText,
  ENGINE_RESTART_MESSAGE,
  ENGINE_RESUMED_MESSAGE,
  type EngineNoticeKind,
  type FeedAuthor,
  type FeedFrame,
  type FeedItemVM,
  type FeedMention,
  type FeedOutput,
  FIRST_RESPONSE_TIMEOUT_MS,
  type FirstResponse,
  type FirstResponseOutcome,
  type HistoryWindowVM,
  historyToFeed,
  type ImportFailureKind,
  isEngineWakingRejection,
  isNotConnectedError,
  isStoppedByUser,
  isTurnRunningRejection,
  type MarkedRead,
  MultiplexFeedOutput,
  messageLimitRefusal,
  noticeEndsTurn,
  observeConversation,
  type PendingInteraction,
  PREWARM_REFRESH_MS,
  type PrewarmCapabilities,
  providerAccountBlockedRefusal,
  type QueuedMessageVM,
  readPastOwnTurns,
  SEND_IN_FLIGHT_MESSAGE,
  type SendWaitReason,
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
  TURN_UNCONFIRMED_MESSAGE,
  type TurnAttachmentsSaveInput,
  type TurnAttachmentsSaveResult,
  type TurnConversationInput,
  type TurnImportInput,
  type TurnPrewarmInput,
  type TurnSendInput,
  type TurnSetModeInput,
  type TurnSetupNotice,
  TurnsHttpError,
  type TurnTruncateInput,
  type TurnWirePin,
  turnErrorMessage,
  turnFailureReport,
} from "./modules/turns";
