// The turns module's public surface beyond `createTurnsModule`, re-exported
// by `index.ts`.
export {
  type AttachmentRef,
  buildAttachmentText,
  type DecodedAttachmentText,
  decodeAttachmentText,
} from "./attachment-text";
export {
  type AttachmentsOperation,
  AttachmentTooLargeError,
  type AttachmentUpload,
  asAttachmentsSaveInput,
  createAttachmentsOperation,
  type TurnAttachmentsSaveInput,
  type TurnAttachmentsSaveResult,
} from "./attachments";
export type { DismissInteractionOutcome } from "./conversation-controls";
export {
  type TurnPrewarmInput,
  TurnsHttpError,
} from "./conversation-prewarm";
export {
  type ComposerDraft,
  PREWARM_REFRESH_MS,
  type PrewarmCapabilities,
} from "./draft-prewarm";
export {
  type BoardStatus,
  type FeedOutput,
  MultiplexFeedOutput,
  type PendingInteraction,
  type SessionStatusValue,
  type TerminalBoardStatus,
} from "./feed-output";
export {
  FIRST_RESPONSE_TIMEOUT_MS,
  type FirstResponse,
  type FirstResponseOutcome,
} from "./first-response";
export { type FeedFrame, historyToFeed } from "./history";
export { observeConversation } from "./observe-stream";
export { TURN_DIED_MESSAGE } from "./settle-from-history";
export {
  SEND_IN_FLIGHT_MESSAGE,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
  type StreamTuning,
  streamKey,
} from "./stream-registry";
export {
  ENGINE_RESTART_MESSAGE,
  ENGINE_RESUMED_MESSAGE,
  type EngineNoticeKind,
  isEngineWakingRejection,
  isNotConnectedError,
  isStoppedByUser,
  messageLimitRefusal,
  TURN_FAILED_MESSAGE,
  turnErrorMessage,
} from "./turn-errors";
export type {
  TurnConversationInput,
  TurnImportInput,
  TurnSendInput,
  TurnSetModeInput,
  TurnTruncateInput,
} from "./turn-inputs";
export { isTurnRunningRejection } from "./turn-running";
export {
  type StreamTurnOptions,
  streamTurn,
  type TurnWirePin,
} from "./turn-stream";
export {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
  DEFAULT_CONVERSATION_CACHE_MAX,
  type FeedAuthor,
  type FeedItemVM,
  type FeedMention,
  type HistoryWindowVM,
  type QueuedMessageVM,
} from "./vm-output";
