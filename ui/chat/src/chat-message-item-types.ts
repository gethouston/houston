import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages-types";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

export interface MessageEditingProps {
  editingKey: string | null;
  onSubmit: (msg: ChatMessage, text: string) => void | Promise<void>;
  onCancel: () => void;
  labels?: { send?: string; cancel?: string; editor?: string };
}

export interface ChatMessageItemProps {
  item: ChatDisplayItem;
  messageCount: number;
  turnEndSummaries: Map<number, TurnEndSummary>;
  highlightedMessageKey: string | null;
  selectedLabel?: string;
  showAuthorLabels: boolean;
  forcedSenders: boolean;
  isRunStart: boolean;
  agentLabel?: string;
  renderSenderAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  senderNameClass?: ChatMessagesProps["senderNameClass"];
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
  messageEditing?: MessageEditingProps;
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
  currentUserId?: string;
  authorLabels?: ChatAuthorLabels;
  mentionPeople?: ChatMessagesProps["mentionPeople"];
}
