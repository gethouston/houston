// === Types ===

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
export { authorLabelFor } from "./chat-messages";
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
// (plan_ready): the drafted plan + Start working / Run on Autopilot / Keep
// planning. Props-only; the app supplies localized labels and wires the sends.
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
export type { ChatProcessLabels } from "./chat-process-block";
export type { ChatSidebarProps } from "./chat-sidebar";
export { ChatSidebar } from "./chat-sidebar";
export type { ChatStatusLineProps } from "./chat-status-line";
export { ChatStatusLine } from "./chat-status-line";
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
// continuing; a stepper (one question or connect step at a time) shown above the
// always-mounted composer while a pending interaction is awaiting the user.
export type {
  ChatInteractionAnswer,
  ChatInteractionCardProps,
  ChatInteractionOption,
  ChatInteractionStep,
  StepFooterApi,
} from "./interaction-card";
export { ChatInteractionCard } from "./interaction-card";
export { prettifyToolkit } from "./interaction-card-model";
// The shared footer row a signin/connect step body composes so its filled CTA
// sits in the exact same chrome as a question step's Next.
export { InteractionFooter } from "./interaction-card-parts";
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
export type { TurnEndSummary } from "./turn-tools";
export type {
  AuthFailureCause,
  FeedItem,
  MessageAuthor,
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
