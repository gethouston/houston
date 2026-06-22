import type { ReactNode } from "react";
import { Message } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ToolsAndCardsProps } from "./chat-helpers";
import { ChatProcessBlock } from "./chat-process-block";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

type ProcessItem = Extract<ChatDisplayItem, { kind: "process" }>;

interface ChatProcessMessageProps {
  item: ProcessItem;
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

  return (
    <Message
      from="assistant"
      className="-my-6"
      avatar={renderMessageAvatar?.(item.segments[0].message)}
    >
      <div>
        <ChatProcessBlock
          segments={item.segments}
          isActive={item.isActive}
          labels={processLabels}
          toolLabels={toolLabels}
          isSpecialTool={isSpecialTool}
          renderToolResult={renderToolResult}
          getThinkingMessage={getThinkingMessage}
        />
        {summary && renderTurnSummary ? renderTurnSummary(summary) : null}
      </div>
    </Message>
  );
}
