import type { ToolEntry, TurnEndSummary } from "@houston-ai/chat";
import { ToolBlock } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { FileCard } from "../components/file-card";
import { TurnFileSummary } from "../components/turn-file-summary";
import { isFileWriteTool } from "../lib/file-write-tools";
import { buildTurnSummaryItems } from "../lib/turn-summary-items";
import { isUserVisibleFilePath } from "../lib/user-visible-files";

export function useFileToolRenderer(
  agentPath: string,
  draftKey: string | null,
) {
  const isSpecialTool = useCallback(
    (toolName: string) => isFileWriteTool(toolName),
    [],
  );

  const renderToolResult = useCallback(
    (tool: ToolEntry, index: number) => {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      const filePath = (inp?.file_path ?? inp?.path) as string | undefined;
      const isError = tool.result?.is_error ?? false;

      return (
        <div key={index} className="space-y-2">
          <ToolBlock tool={tool} isActive={false} />
          {filePath && !isError && isUserVisibleFilePath(filePath) && (
            <FileCard
              filePath={filePath}
              agentPath={agentPath}
              draftKey={draftKey}
            />
          )}
        </div>
      );
    },
    [agentPath, draftKey],
  );

  const renderTurnSummary = useCallback(
    (summary: TurnEndSummary) => {
      const items = buildTurnSummaryItems(
        summary.tools,
        agentPath,
        summary.fileChanges,
      );
      if (items.length === 0) return null;
      return (
        <TurnFileSummary
          items={items}
          agentPath={agentPath}
          draftKey={draftKey}
        />
      );
    },
    [agentPath, draftKey],
  );

  return useMemo(
    () => ({ isSpecialTool, renderToolResult, renderTurnSummary }),
    [isSpecialTool, renderToolResult, renderTurnSummary],
  );
}
