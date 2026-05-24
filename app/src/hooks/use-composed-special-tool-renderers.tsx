/**
 * Compose multiple "special tool renderer" hooks into a single
 * `{ isSpecialTool, renderToolResult, renderPendingTool }` triple that
 * `<ChatPanel>` can consume.
 *
 * Each renderer's predicate is OR'd; the first renderer whose predicate
 * matches gets to render the tool. This lets the file-card hook claim
 * Write/Edit/MultiEdit and the ask-user hook claim
 * `mcp__houston__AskUserQuestion` without either knowing about the other.
 */

import { useCallback, useMemo } from "react";
import type { ToolEntry } from "@houston-ai/chat";

interface Renderer {
  isSpecialTool: (name: string) => boolean;
  renderToolResult?: (tool: ToolEntry, index: number) => React.ReactNode;
  renderPendingTool?: (tool: ToolEntry, index: number) => React.ReactNode;
}

export function useComposedSpecialToolRenderers(renderers: Renderer[]) {
  const pickRenderer = useCallback(
    (toolName: string) => renderers.find((r) => r.isSpecialTool(toolName)),
    [renderers],
  );

  const isSpecialTool = useCallback(
    (toolName: string) => !!pickRenderer(toolName),
    [pickRenderer],
  );

  const renderToolResult = useCallback(
    (tool: ToolEntry, index: number) => {
      const renderer = pickRenderer(tool.name);
      return renderer?.renderToolResult?.(tool, index) ?? null;
    },
    [pickRenderer],
  );

  const renderPendingTool = useCallback(
    (tool: ToolEntry, index: number) => {
      const renderer = pickRenderer(tool.name);
      return renderer?.renderPendingTool?.(tool, index) ?? null;
    },
    [pickRenderer],
  );

  return useMemo(
    () => ({ isSpecialTool, renderToolResult, renderPendingTool }),
    [isSpecialTool, renderToolResult, renderPendingTool],
  );
}
