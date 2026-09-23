import type { ToolEntry, TurnEndSummary } from "@houston-ai/chat";
import { ToolBlock } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { FileCard } from "../components/file-card";
import { TurnFileSummary } from "../components/turn-file-summary";
import { isFileWriteTool } from "../lib/file-write-tools";
import { buildTurnSummaryItems } from "../lib/turn-summary-items";
import { isUserVisibleFilePath } from "../lib/user-visible-files";

/**
 * Returns `isSpecialTool`, `renderToolResult`, and `renderTurnSummary`
 * callbacks for rendering clickable file cards on Write/Edit tool results
 * and an aggregated end-of-turn file summary.
 */
export function useFileToolRenderer(agentPath: string) {
  const isSpecialTool = useCallback(
    (toolName: string) => isFileWriteTool(toolName),
    [],
  );

  const renderToolResult = useCallback(
    (tool: ToolEntry, index: number) => {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      // Claude tools carry `file_path`; pi tools carry `path`.
      const filePath = (inp?.file_path ?? inp?.path) as string | undefined;
      const isError = tool.result?.is_error ?? false;

      return (
        <div key={index} className="space-y-2">
          <ToolBlock tool={tool} isActive={false} />
          {filePath && !isError && isUserVisibleFilePath(filePath) && (
            <FileCard filePath={filePath} agentPath={agentPath} />
          )}
        </div>
      );
    },
    [agentPath],
  );

  const renderTurnSummary = useCallback(
    (summary: TurnEndSummary) => {
      const items = buildTurnSummaryItems(
        summary.tools,
        agentPath,
        summary.fileChanges,
      );
      if (items.length === 0) return null;
      return <TurnFileSummary items={items} agentPath={agentPath} />;
    },
    [agentPath],
  );

  return useMemo(
    () => ({ isSpecialTool, renderToolResult, renderTurnSummary }),
    [isSpecialTool, renderToolResult, renderTurnSummary],
  );
}
