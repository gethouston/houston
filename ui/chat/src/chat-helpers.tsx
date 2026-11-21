import type { ReactNode } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import { ToolBlock } from "./ai-elements/tool-block";
import type { ToolEntry } from "./feed-to-messages";

export type { ToolBlockProps } from "./ai-elements/tool-block";
export { ToolBlock } from "./ai-elements/tool-block";
export type { ChatMessage, ToolEntry } from "./feed-to-messages";
export { feedItemsToMessages } from "./feed-to-messages";

export interface ToolsAndCardsProps {
  tools: ToolEntry[];
  isStreaming: boolean;
  toolLabels?: Record<string, string>;
  isSpecialTool?: (toolName: string) => boolean;
  renderToolResult?: (tool: ToolEntry, index: number) => ReactNode;
}

export function ToolsAndCards({
  tools,
  isStreaming,
  toolLabels,
  isSpecialTool,
  renderToolResult,
}: ToolsAndCardsProps) {
  const allDone =
    isStreaming && tools.length > 0 && tools.every((t) => t.result);

  const toolKeys = (() => {
    const counts = new Map<string, number>();
    return tools.map((tool) => {
      const n = counts.get(tool.name) ?? 0;
      counts.set(tool.name, n + 1);
      return `${tool.name}-${n}`;
    });
  })();

  return (
    <div className="space-y-2 mb-4">
      {tools.map((tool, i) => {
        const toolKey = toolKeys[i];
        if (isSpecialTool?.(tool.name) && tool.result && renderToolResult) {
          return (
            <div key={`special-${toolKey}`} className="py-1">
              {renderToolResult(tool, i)}
            </div>
          );
        }

        const isLastTool = i === tools.length - 1;
        const isActive = isStreaming && isLastTool && !tool.result;

        return (
          <ToolBlock
            key={toolKey}
            tool={tool}
            isActive={isActive}
            toolLabels={toolLabels}
          />
        );
      })}
      {allDone && (
        <div className="text-sm text-ink-muted">
          <Shimmer duration={1.5}>Processing...</Shimmer>
        </div>
      )}
    </div>
  );
}

export interface ToolActivityProps {
  tools: ToolEntry[];
  isStreaming: boolean;
  toolLabels?: Record<string, string>;
}

/** @deprecated Use ToolsAndCards with ToolBlock instead. */
export function ToolActivity({
  tools,
  isStreaming,
  toolLabels,
}: ToolActivityProps) {
  return (
    <ToolsAndCards
      tools={tools}
      isStreaming={isStreaming}
      toolLabels={toolLabels}
    />
  );
}
