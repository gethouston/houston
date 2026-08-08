// === Types ===

export {
  attachmentFolderRoot,
  attachmentRelativePath,
  MAX_ATTACHMENT_FILES,
  TooManyAttachmentFilesError,
} from "@houston-ai/core";
export { humanizeActionDone, humanizeActionGerund } from "./action-labels";
export type {
  ConversationContentProps,
  ConversationDownloadProps,
  ConversationEmptyStateProps,
  ConversationProps,
  ConversationScrollButtonProps,
} from "./ai-elements/conversation";
// === AI Elements: Conversation ===
export {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
  messagesToMarkdown,
} from "./ai-elements/conversation";
export type {
  MessageActionProps,
  MessageActionsProps,
  MessageBranchContentProps,
  MessageBranchNextProps,
  MessageBranchPageProps,
  MessageBranchPreviousProps,
  MessageBranchProps,
  MessageBranchSelectorProps,
  MessageContentProps,
  MessageProps,
  MessageResponseProps,
  MessageToolbarProps,
} from "./ai-elements/message";
// === AI Elements: Message ===
export {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "./ai-elements/message";
export type {
  AttachmentsContext,
  PromptInputActionAddAttachmentsProps,
  PromptInputActionAddScreenshotProps,
  PromptInputActionMenuContentProps,
  PromptInputActionMenuItemProps,
  PromptInputActionMenuProps,
  PromptInputActionMenuTriggerProps,
  PromptInputBodyProps,
  PromptInputButtonProps,
  PromptInputButtonTooltip,
  PromptInputCommandEmptyProps,
  PromptInputCommandGroupProps,
  PromptInputCommandInputProps,
  PromptInputCommandItemProps,
  PromptInputCommandListProps,
  PromptInputCommandProps,
  PromptInputCommandSeparatorProps,
  PromptInputControllerProps,
  PromptInputFooterProps,
  PromptInputHeaderProps,
  PromptInputHoverCardContentProps,
  PromptInputHoverCardProps,
  PromptInputHoverCardTriggerProps,
  PromptInputMessage,
  PromptInputProps,
  PromptInputProviderProps,
  PromptInputSelectContentProps,
  PromptInputSelectItemProps,
  PromptInputSelectProps,
  PromptInputSelectTriggerProps,
  PromptInputSelectValueProps,
  PromptInputSubmitProps,
  PromptInputTabBodyProps,
  PromptInputTabItemProps,
  PromptInputTabLabelProps,
  PromptInputTabProps,
  PromptInputTabsListProps,
  PromptInputTextareaProps,
  PromptInputToolsProps,
  ReferencedSourcesContext,
  TextInputContext,
} from "./ai-elements/prompt-input";
// === AI Elements: Prompt Input ===
export {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputCommandSeparator,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
  PromptInputProvider,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTab,
  PromptInputTabBody,
  PromptInputTabItem,
  PromptInputTabLabel,
  PromptInputTabsList,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  usePromptInputReferencedSources,
  useProviderAttachments,
} from "./ai-elements/prompt-input";
export type {
  ReasoningContentProps,
  ReasoningProps,
  ReasoningTriggerProps,
} from "./ai-elements/reasoning";
// === AI Elements: Reasoning ===
export {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from "./ai-elements/reasoning";
export type { TextShimmerProps } from "./ai-elements/shimmer";
// === AI Elements: Shimmer ===
export { Shimmer } from "./ai-elements/shimmer";
export type {
  SuggestionProps,
  SuggestionsProps,
} from "./ai-elements/suggestion";
// === AI Elements: Suggestion ===
export { Suggestion, Suggestions } from "./ai-elements/suggestion";
export type {
  AttachmentInvocation,
  AttachmentReference,
} from "./attachment-message";
export {
  decodeAttachmentMessage,
  normalizeAttachmentReferences,
} from "./attachment-message";
export type { AutolinkProps } from "./autolink";
// The inline link chip, shared with surfaces that render markdown as a
// DOCUMENT rather than a chat turn (the file preview): mid-sentence, a link
// has to read as a link, not as the chat bubble's labeled button pill.
export { AUTOLINK_CLASS, Autolink } from "./autolink";
export type { ChannelSource } from "./channel-avatar";
export { ChannelAvatar } from "./channel-avatar";
export type {
  ToolActivityProps,
  ToolBlockProps,
  ToolsAndCardsProps,
} from "./chat-helpers";
export {
  feedItemsToMessages,
  ToolActivity,
  ToolBlock,
  ToolsAndCards,
} from "./chat-helpers";
export type { ChatComposerLabels, ChatInputProps } from "./chat-input";
export { ChatInput } from "./chat-input";
export type { AttachMenuItem } from "./chat-input-parts";
export type { ChatAuthorLabels } from "./chat-messages";
export { isOwnMessage, senderNameFor } from "./chat-messages";
// === Child-mission list ===
// The missions THIS chat started (PRODUCT-1244), listed above the composer so a
// coordinating mission is also its own monitor. Props-only: the app resolves
// which missions are children, localizes their status word, and wires opening.
export type {
  ChatMissionListItem,
  ChatMissionListLabels,
  ChatMissionListProps,
  ChatMissionTone,
} from "./chat-mission-list";
export {
  ChatMissionList,
  DEFAULT_CHAT_MISSION_LIST_LABELS,
} from "./chat-mission-list";
// === Chat Components ===
export { ChatPanel } from "./chat-panel";
export type {
  AttachmentRejection,
  ChatPanelProps,
  PrepareAttachments,
  PreparedAttachments,
} from "./chat-panel-types";
// === Plan-ready card ===
// The composer-replacing surface shown when the agent finishes planning
// (plan_ready): a compact plan lede + Start working / Run on Autopilot / Keep
// planning. The full plan remains in the assistant message. Props-only; the app
// supplies localized labels and wires the sends.
export type { ChatPlanReadyCardProps } from "./chat-plan-ready-card";
export { ChatPlanReadyCard } from "./chat-plan-ready-card";
export type {
  ChatPlanReadyLabels,
  PlanReadyAction,
  PlanReadyActionKey,
} from "./chat-plan-ready-card-model";
export {
  DEFAULT_PLAN_READY_LABELS,
  resolvePlanReadyActions,
} from "./chat-plan-ready-card-model";
export type { ChatActionBrand, ChatProcessLabels } from "./chat-process-block";
export type { ChatSidebarProps } from "./chat-sidebar";
export { ChatSidebar } from "./chat-sidebar";
export type { ChatStatusLineProps } from "./chat-status-line";
export { ChatStatusLine } from "./chat-status-line";
export type {
  ChatSuggestActionsLabels,
  ChatSuggestActionsProps,
} from "./chat-suggest-actions";
export {
  ChatSuggestActions,
  DEFAULT_SUGGEST_ACTIONS_LABELS,
} from "./chat-suggest-actions";
// === Suggest-reusable card ===
// The composer-replacing surface shown when the agent finishes cleanly and calls
// `suggest_reusable`: an optional, dismissible offer to save the just-completed
// work as a Skill or a scheduled Routine (Save / Not now). Props-only; the app
// supplies localized labels and wires the send.
export type { ChatSuggestReusableCardProps } from "./chat-suggest-reusable-card";
export { ChatSuggestReusableCard } from "./chat-suggest-reusable-card";
export type { ChatSuggestReusableLabels } from "./chat-suggest-reusable-card-model";
export {
  DEFAULT_SUGGEST_REUSABLE_LABELS,
  resolveSuggestReusableSaveLabel,
} from "./chat-suggest-reusable-card-model";
// === Thinking indicator (HOU-910) ===
// The pre-reply loading state: a pulsing helmet + rotating astronaut one-liners.
// i18n-agnostic — the app passes its localized `phrases`; defaults stand alone.
export {
  ChatThinkingIndicator,
  type ChatThinkingIndicatorProps,
} from "./chat-thinking-indicator";
export { ConversationActionsMenu } from "./conversation-actions-menu";
export type {
  ConversationMapActions,
  ConversationMapLabels,
  ConversationMapProps,
} from "./conversation-map";
export { ConversationMap } from "./conversation-map";
export type { ResolvedConversationMapLabels } from "./conversation-map-labels";
export { resolveConversationMapLabels } from "./conversation-map-labels";
export type {
  ConversationMoment,
  ConversationMomentType,
} from "./conversation-map-model";
export {
  deriveConversationMoments,
  hasConversationMoments,
} from "./conversation-map-model";
// === Dictation ===
export type {
  DictationControl,
  DictationLabels,
  DictationState,
  DictationView,
} from "./dictation-types";
export {
  DEFAULT_DICTATION_LABELS,
  formatElapsed,
  isDictationBusy,
  isDictationCapturing,
  resolveDictationView,
} from "./dictation-types";
export type { MergeFeedOptions, PendingUserEcho } from "./feed-merge";
export {
  mergeFeedHistory,
  mergeFeedItem,
  reconcileUserMessageEcho,
} from "./feed-merge";
export type {
  ChatCompactionInfo,
  ChatMessage,
  FileChangeEntry,
  ToolEntry,
} from "./feed-to-messages";
export { distinctAuthorCount } from "./feed-to-messages";
export type { FileChipProps } from "./file-chip";
// The inline affordance for a workspace file named in agent prose — the file
// vocabulary (type glyph + tint), never the web link's blue chip or ↗ pill.
export { FileChip } from "./file-chip";
export type {
  InteractionAnswerLine,
  InteractionAnswersPayload,
} from "./interaction-answers-message";
// === Interaction-answers Messages ===
// Encoded user-message marker that signals "this message is the answers the
// user gave to an ask_user interaction sequence". Decoded into a structured
// payload so consumers (desktop, mobile) can render the same Q&A card.
export { decodeInteractionAnswersMessage } from "./interaction-answers-message";
// === Interaction Card ===
// The in-chat surface shown when the agent pauses to gather what it needs before
// continuing; a stepper (one question or connect step at a time) that replaces
// the composer while a pending interaction is awaiting the user.
export type {
  ChatInteractionAnswer,
  ChatInteractionBrand,
  ChatInteractionCardProps,
  ChatInteractionOption,
  ChatInteractionStep,
  StepChrome,
  StepFooterApi,
} from "./interaction-card";
export { ChatInteractionCard } from "./interaction-card";
export { prettifyToolkit } from "./interaction-card-model";
// The always-visible single-line free-text row every non-question step carries
// (connect / sign-in / credential decline-with-instruction).
export { InlineTextRow } from "./interaction-decline-row";
// The shared modal shell every interaction step composes (a signin/connect body
// renders its own, wired with the StepChrome the stepper hands it) so the whole
// family shares one surface, header row, and footer row.
export {
  InteractionModal,
  type InteractionModalPager,
  type InteractionModalProps,
  InteractionModalTitle,
} from "./interaction-modal";
// === @mentions (HOU-944) ===
// A teammate named in a chat message. The composer offers `mentionPeople` and
// ships the structured `mentions[]` sidecar; the renderer turns each surviving
// "@Name" run into a chip. All props-only and i18n-agnostic.
//
// The only surface a consumer needs is the two data shapes, `MentionPerson`
// and `MessageMention` (exported with the rest of the types below) plus the
// `ChatPanel` props that take them. The matcher, the composer state, the mask
// and the chip are INTERNAL: they are one feature's moving parts, and the
// tests reach them by module path rather than through the package door.
//
// Clean, human-readable preview of a persisted user-message body: decodes the
// Skill / attachment markers so cards and lists never show the raw marker.
export { messagePreviewText } from "./message-preview";
export type { ProgressPanelProps } from "./progress-panel";
export { ProgressPanel } from "./progress-panel";
export type {
  QueuedChatMessage,
  QueuedMessageLabels,
  QueuedMessageListProps,
} from "./queued-message-list";
export { QueuedMessageList } from "./queued-message-list";
export type { SkillInvocation, SkillInvocationField } from "./skill-message";
// === Skill Messages ===
// Encoded user-message marker that signals "this message is the user
// running a Skill". Decoded into a structured payload so consumers
// (desktop, mobile) can render the same card.
export { decodeSkillMessage, resolveSkillImage } from "./skill-message";
export { DEFAULT_THINKING_PHRASES } from "./thinking-phrases";
export type { TurnEndSummary } from "./turn-tools";
export type {
  AuthFailureCause,
  FeedItem,
  MentionPerson,
  MessageAuthor,
  MessageMention,
  ModelUnavailableReason,
  ProviderError,
  QuotaScope,
  RunStatus,
  TokenUsage,
  ToolRuntimeErrorEntry,
} from "./types";
// === Utilities ===
export { Typewriter } from "./typewriter";
export type { ProgressStep, StepStatus } from "./use-progress-steps";
// === Progress ===
export { useProgressSteps } from "./use-progress-steps";
export type { UserAttachmentMessageLabels } from "./user-attachment-message";
export {
  UserAttachmentBadge,
  UserAttachmentMessage,
} from "./user-attachment-message";
export { UserInteractionAnswersMessage } from "./user-interaction-answers-message";
