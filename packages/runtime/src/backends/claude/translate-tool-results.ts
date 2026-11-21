import { clipToolResult, type WireEvent } from "@houston/runtime-client";
import {
  startedMissionFromMcpResult,
  startedMissionFromMcpText,
} from "../../session/tools/start-mission-receipt";
import {
  type ToolBlock,
  toolResultText,
  type UserContentBlock,
  unverifiedToolStart,
} from "./translate-support";

export function translateToolResults(
  content: unknown,
  toolUseResult: unknown,
  toolNameById: Map<string, string>,
  awaitingSdkInput: Map<string, ToolBlock>,
): WireEvent[] {
  if (!Array.isArray(content)) return [];
  const out: WireEvent[] = [];
  const resultBlocks = (content as UserContentBlock[]).filter(
    (block) => block?.type === "tool_result",
  );
  for (const block of content as UserContentBlock[]) {
    if (block?.type !== "tool_result") continue;
    const name = block.tool_use_id && toolNameById.get(block.tool_use_id);
    if (!name) continue;
    const waiting =
      block.tool_use_id && awaitingSdkInput.get(block.tool_use_id);
    if (waiting) {
      awaitingSdkInput.delete(waiting.id);
      out.push(unverifiedToolStart(waiting));
    }
    const preview = toolResultText(block.content);
    const mission =
      !block.is_error &&
      (name === "start_mission" || name.endsWith("__start_mission"))
        ? ((resultBlocks.length === 1
            ? startedMissionFromMcpResult(toolUseResult)
            : undefined) ?? startedMissionFromMcpText(preview))
        : undefined;
    out.push({
      type: "tool_end",
      data: {
        name,
        isError: !!block.is_error,
        ...(preview ? { content: clipToolResult(preview) } : {}),
        ...(mission ? { mission } : {}),
      },
    });
  }
  return out;
}
