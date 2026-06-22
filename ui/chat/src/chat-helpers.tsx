/**
 * Chat helper components -- tool activity display.
 *
 * Generic version: no Houston-specific tool detection. Consumers can provide
 * custom tool mappings or a renderToolResult render prop to handle
 * application-specific tool results.
 */

import type { ReactNode } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import { ToolBlock } from "./ai-elements/tool-block";
import type { ToolEntry } from "./feed-to-messages";

export type { ToolBlockProps } from "./ai-elements/tool-block";
export { ToolBlock } from "./ai-elements/tool-block";
// Re-export types and conversion for convenient imports
export type { ChatMessage, ToolEntry } from "./feed-to-messages";
export { feedItemsToMessages } from "./feed-to-messages";

// ---------------------------------------------------------------------------
// ToolsAndCards -- renders individual ToolBlocks with special-tool support
// ---------------------------------------------------------------------------

export interface ToolsAndCardsProps {
  tools: ToolEntry[];
  isStreaming: boolean;
  /** Custom tool name → human label mappings */
  toolLabels?: Record<string, string>;
  /**
   * Predicate to identify "special" tools that should be rendered via
   * renderToolResult instead of the default ToolBlock.
   * Defaults to returning false (all tools shown as ToolBlocks).
   */
  isSpecialTool?: (toolName: string) => boolean;
  /**
   * Render prop for special tool results. Called for each tool where
   * isSpecialTool returns true and the tool has a result.
   */
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

  // Build stable keys by tracking occurrence count per tool name.
  // ToolEntry has no unique id; the same tool can be called multiple times,
  // so we key by name + occurrence index (e.g. "bash-0", "bash-1").
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
        // Special tools get custom rendering
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
        <div className="text-sm text-muted-foreground">
          <Shimmer duration={1.5}>Processing...</Shimmer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolActivity -- legacy compact list (kept for backward compat)
// ---------------------------------------------------------------------------

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
