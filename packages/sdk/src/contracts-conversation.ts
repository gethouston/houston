/**
 * The conversation contract: the conversation list, the turn/feed machinery a
 * host drives with its own `FeedOutput`, and search across missions.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 */
// ===== Conversations module contract ===================================
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
  type AttachmentRef,
  type AttachmentsOperation,
  AttachmentTooLargeError,
  type AttachmentUpload,
  asAttachmentsSaveInput,
  type BoardStatus,
  buildAttachmentText,
  type ComposerDraft,
  type ConversationVM,
  ConversationVmOutput,
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
  isEngineWakingRejection,
  isNotConnectedError,
  isStoppedByUser,
  isTurnRunningRejection,
  MultiplexFeedOutput,
  messageLimitRefusal,
  observeConversation,
  type PendingInteraction,
  PREWARM_REFRESH_MS,
  type PrewarmCapabilities,
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
  type TurnConversationInput,
  type TurnImportInput,
  type TurnPrewarmInput,
  type TurnSendInput,
  type TurnSetModeInput,
  TurnsHttpError,
  type TurnTruncateInput,
  type TurnWirePin,
  turnErrorMessage,
} from "./modules/turns";
