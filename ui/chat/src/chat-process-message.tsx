import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { Message } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatProcessLabels } from "./chat-process-block";
import { ChatProcessBlock } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

type ProcessItem = Extract<ChatDisplayItem, { kind: "process" }>;

interface ChatProcessMessageProps {
  item: ProcessItem;
  /** Merged onto the root Message (the offscreen render-skip classes). */
  className?: string;
  turnEndSummaries: Map<number, TurnEndSummary>;
  renderMessageAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  renderTurnSummary?: (summary: TurnEndSummary) => ReactNode;
  processLabels?: ChatProcessLabels;
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  getThinkingMessage?: ReasoningTriggerProps["getThinkingMessage"];
}

export function ChatProcessMessage({
  item,
  className,
  turnEndSummaries,
  renderMessageAvatar,
  renderTurnSummary,
  processLabels,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  getThinkingMessage,
}: ChatProcessMessageProps) {
  const summary =
    item.isTrailing && !item.isActive
      ? turnEndSummaries.get(item.sourceIndex)
      : undefined;
  const trailer =
    summary && renderTurnSummary ? renderTurnSummary(summary) : null;

  // An offers-only block (see `ChatDisplayItem.offersOnly`) draws no log: the
  // bubbles it recorded render above the composer. Only the turn-end summary
  // it anchors remains — and nothing at all when there is none.
  if (item.offersOnly && !trailer) return null;

  return (
    <Message
      from="assistant"
      className={cn("-my-6", className)}
      avatar={renderMessageAvatar?.(item.segments[0].message)}
    >
      <div>
        {item.offersOnly ? null : (
          <ChatProcessBlock
            segments={item.segments}
            isActive={item.isActive}
            labels={processLabels}
            toolLabels={toolLabels}
            isSpecialTool={isSpecialTool}
            renderToolResult={renderToolResult}
            getThinkingMessage={getThinkingMessage}
          />
        )}
        {trailer}
      </div>
    </Message>
  );
}
