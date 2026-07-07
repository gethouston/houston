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
export type { ChatProcessLabels } from "./chat-process-block";
export type { ChatSidebarProps } from "./chat-sidebar";
export { ChatSidebar } from "./chat-sidebar";
export type { ChatStatusLineProps } from "./chat-status-line";
export { ChatStatusLine } from "./chat-status-line";
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
// Clean, human-readable preview of a persisted user-message body: decodes the
// Skill / attachment markers so cards and lists never show the raw marker.
export { messagePreviewText } from "./message-preview";
export type { ProgressPanelProps } from "./progress-panel";
export { ProgressPanel } from "./progress-panel";
// === Question Card ===
// The in-chat surface shown when the agent pauses to ask the user something;
// replaces the composer while a pending interaction is awaiting an answer.
export type {
  ChatQuestionCardProps,
  ChatQuestionOption,
} from "./question-card";
export { ChatQuestionCard } from "./question-card";
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
