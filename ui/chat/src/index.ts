// === Types ===
export type {
  FeedItem,
  RunStatus,
  ToolRuntimeErrorEntry,
  ProviderError,
  QuotaScope,
  ModelUnavailableReason,
  AuthFailureCause,
} from "./types";
export type {
  ToolEntry,
  ChatMessage,
  FileChangeEntry,
} from "./feed-to-messages";
export type { TurnEndSummary } from "./turn-tools";

// === AI Elements: Conversation ===
export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ConversationDownload,
  messagesToMarkdown,
} from "./ai-elements/conversation";
export type {
  ConversationProps,
  ConversationContentProps,
  ConversationEmptyStateProps,
  ConversationScrollButtonProps,
  ConversationDownloadProps,
} from "./ai-elements/conversation";

// === AI Elements: Message ===
export {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
  MessageBranch,
  MessageBranchContent,
  MessageBranchSelector,
  MessageBranchPrevious,
  MessageBranchNext,
  MessageBranchPage,
  MessageResponse,
  MessageToolbar,
} from "./ai-elements/message";
export type {
  MessageProps,
  MessageContentProps,
  MessageActionsProps,
  MessageActionProps,
  MessageBranchProps,
  MessageBranchContentProps,
  MessageBranchSelectorProps,
  MessageBranchPreviousProps,
  MessageBranchNextProps,
  MessageBranchPageProps,
  MessageResponseProps,
  MessageToolbarProps,
} from "./ai-elements/message";

// === AI Elements: Reasoning ===
export {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
  useReasoning,
} from "./ai-elements/reasoning";
export type {
  ReasoningProps,
  ReasoningTriggerProps,
  ReasoningContentProps,
} from "./ai-elements/reasoning";

// === AI Elements: Prompt Input ===
export {
  PromptInput,
  PromptInputProvider,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputHoverCard,
  PromptInputHoverCardTrigger,
  PromptInputHoverCardContent,
  PromptInputTabsList,
  PromptInputTab,
  PromptInputTabLabel,
  PromptInputTabBody,
  PromptInputTabItem,
  PromptInputCommand,
  PromptInputCommandInput,
  PromptInputCommandList,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandSeparator,
  usePromptInputController,
  useProviderAttachments,
  usePromptInputAttachments,
  usePromptInputReferencedSources,
} from "./ai-elements/prompt-input";
export type {
  PromptInputProps,
  PromptInputProviderProps,
  PromptInputMessage,
  PromptInputBodyProps,
  PromptInputTextareaProps,
  PromptInputHeaderProps,
  PromptInputFooterProps,
  PromptInputToolsProps,
  PromptInputButtonProps,
  PromptInputButtonTooltip,
  PromptInputSubmitProps,
  PromptInputActionMenuProps,
  PromptInputActionMenuTriggerProps,
  PromptInputActionMenuContentProps,
  PromptInputActionMenuItemProps,
  PromptInputActionAddAttachmentsProps,
  PromptInputActionAddScreenshotProps,
  PromptInputSelectProps,
  PromptInputSelectTriggerProps,
  PromptInputSelectContentProps,
  PromptInputSelectItemProps,
  PromptInputSelectValueProps,
  PromptInputHoverCardProps,
  PromptInputHoverCardTriggerProps,
  PromptInputHoverCardContentProps,
  PromptInputTabsListProps,
  PromptInputTabProps,
  PromptInputTabLabelProps,
  PromptInputTabBodyProps,
  PromptInputTabItemProps,
  PromptInputCommandProps,
  PromptInputCommandInputProps,
  PromptInputCommandListProps,
  PromptInputCommandEmptyProps,
  PromptInputCommandGroupProps,
  PromptInputCommandItemProps,
  PromptInputCommandSeparatorProps,
  PromptInputControllerProps,
  AttachmentsContext,
  TextInputContext,
  ReferencedSourcesContext,
} from "./ai-elements/prompt-input";

// === AI Elements: Shimmer ===
export { Shimmer } from "./ai-elements/shimmer";
export type { TextShimmerProps } from "./ai-elements/shimmer";

// === AI Elements: Suggestion ===
export { Suggestions, Suggestion } from "./ai-elements/suggestion";
export type {
  SuggestionsProps,
  SuggestionProps,
} from "./ai-elements/suggestion";

// === Chat Components ===
export { ChatPanel } from "./chat-panel";
export type {
  AttachmentRejection,
  ChatPanelProps,
  PreparedAttachments,
  PrepareAttachments,
} from "./chat-panel-types";
export type { ChatProcessLabels } from "./chat-process-block";

export { ChatInput } from "./chat-input";
export type { ChatInputProps, ChatComposerLabels } from "./chat-input";
export type { AttachMenuItem } from "./chat-input-parts";
export { QueuedMessageList } from "./queued-message-list";
export type {
  QueuedChatMessage,
  QueuedMessageLabels,
  QueuedMessageListProps,
} from "./queued-message-list";

export {
  ToolActivity,
  ToolsAndCards,
  ToolBlock,
  feedItemsToMessages,
} from "./chat-helpers";
export type {
  ToolActivityProps,
  ToolsAndCardsProps,
  ToolBlockProps,
} from "./chat-helpers";

// === Progress ===
export { useProgressSteps } from "./use-progress-steps";
export type { ProgressStep, StepStatus } from "./use-progress-steps";
export { ProgressPanel } from "./progress-panel";
export type { ProgressPanelProps } from "./progress-panel";

// === Skill Messages ===
// Encoded user-message marker that signals "this message is the user
// running a Skill". Decoded into a structured payload so consumers
// (desktop, mobile) can render the same card.
export { decodeSkillMessage, resolveSkillImage } from "./skill-message";
export type { SkillInvocation, SkillInvocationField } from "./skill-message";
export {
  decodeAttachmentMessage,
  normalizeAttachmentReferences,
} from "./attachment-message";
export type {
  AttachmentInvocation,
  AttachmentReference,
} from "./attachment-message";
export {
  UserAttachmentBadge,
  UserAttachmentMessage,
} from "./user-attachment-message";
export type { UserAttachmentMessageLabels } from "./user-attachment-message";

// === Utilities ===
export { Typewriter } from "./typewriter";
export { mergeFeedItem } from "./feed-merge";
export { ChannelAvatar } from "./channel-avatar";
export type { ChannelSource } from "./channel-avatar";

export { ChatSidebar } from "./chat-sidebar";
export type { ChatSidebarProps } from "./chat-sidebar";
