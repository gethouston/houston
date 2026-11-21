import type { ReactNode, RefObject } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessageItemProps } from "./chat-message-item-types";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ConversationMapLabels } from "./conversation-map";
import type { ConversationMoment } from "./conversation-map-model";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";
import type { MentionPerson } from "./types";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  status: "ready" | "streaming" | "submitted";
  thinkingIndicator: ReactNode;
  transformContent?: (content: string) => {
    content: string;
    extra?: ReactNode;
  };
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  processLabels?: ChatProcessLabels;
  getThinkingMessage?: ReasoningTriggerProps["getThinkingMessage"];
  renderMessageAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  renderTurnSummary?: (summary: TurnEndSummary) => ReactNode;
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  contextCompactedLabel?: string;
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  onEditMessage?: (msg: ChatMessage) => void;
  canEditMessage?: (msg: ChatMessage) => boolean;
  editMessageLabel?: string;
  enableMessageCopy?: boolean;
  canCopyMessage?: (msg: ChatMessage) => boolean;
  copyMessageLabel?: string;
  messageEditing?: ChatMessageItemProps["messageEditing"];
  afterMessages?: ReactNode;
  onLoadOlder?: () => Promise<unknown>;
  hasOlderMessages?: boolean;
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
  currentUserId?: string;
  authorLabels?: ChatAuthorLabels;
  showSenders?: boolean;
  agentLabel?: string;
  renderSenderAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  senderNameClass?: (msg: ChatMessage) => string | undefined;
  mentionPeople?: readonly MentionPerson[];
  scrollToLatestToken?: number;
  conversationMap?: {
    labels?: ConversationMapLabels;
    findToken?: number;
    returnFocusRef?: RefObject<HTMLButtonElement | null>;
    onOpenChange?: (open: boolean, conversationLength: number) => void;
    onMomentClick?: (
      moment: ConversationMoment,
      conversationLength: number,
    ) => void;
    onBackToLatest?: (conversationLength: number) => void;
  };
}
