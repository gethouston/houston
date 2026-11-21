import type { WireEvent } from "@houston/runtime-client";
import {
  type AssistantContentBlock,
  type EventLike,
  parseDeltaJson,
  type ToolBlock,
  toolStartFrame,
  unverifiedToolStart,
  warnDroppedToolBlock,
} from "./translate-support";
import { translateToolResults } from "./translate-tool-results";

export interface ContentBlockTracker {
  onMessageStart(): void;
  onStreamEvent(event: EventLike): WireEvent[];
  onAssistantMessage(content: unknown): WireEvent[];
  onUserMessage(content: unknown, toolUseResult?: unknown): WireEvent[];
  onTurnEnd(): WireEvent[];
}

export function createContentBlockTracker(): ContentBlockTracker {
  const toolBlocks = new Map<number, ToolBlock>();
  const toolNameById = new Map<string, string>();
  const sdkInputById = new Map<string, unknown>();
  const awaitingSdkInput = new Map<string, ToolBlock>();
  let sawText = false;
  let sawThinking = false;
  let sepText = false;
  let sepThinking = false;

  function onMessageStart(): void {
    for (const tb of toolBlocks.values()) warnDroppedToolBlock(tb);
    toolBlocks.clear();
  }

  function onStreamEvent(event: EventLike): WireEvent[] {
    if (event?.type === "content_block_start" && event.index !== undefined) {
      const block = event.content_block;
      if (block?.type === "tool_use" && block.id && block.name) {
        toolBlocks.set(event.index, {
          id: block.id,
          name: block.name,
          json: "",
          input: block.input,
        });
        toolNameById.set(block.id, block.name);
      }
      if (block?.type === "text" && sawText) sepText = true;
      if (block?.type === "thinking" && sawThinking) sepThinking = true;
      return [];
    }
    if (event?.type === "content_block_delta") {
      const d = event.delta;
      if (d?.type === "text_delta" && d.text !== undefined) {
        sawText = true;
        const data = sepText ? `\n\n${d.text}` : d.text;
        sepText = false;
        return [{ type: "text", data }];
      }
      if (d?.type === "thinking_delta" && d.thinking !== undefined) {
        sawThinking = true;
        const data = sepThinking ? `\n\n${d.thinking}` : d.thinking;
        sepThinking = false;
        return [{ type: "thinking", data }];
      }
      if (d?.type === "input_json_delta" && event.index !== undefined) {
        const tb = toolBlocks.get(event.index);
        if (tb) tb.json += d.partial_json ?? "";
      }
      return [];
    }
    if (event?.type === "content_block_stop" && event.index !== undefined) {
      const tb = toolBlocks.get(event.index);
      if (!tb) return [];
      toolBlocks.delete(event.index);
      if (sdkInputById.has(tb.id)) {
        const input = sdkInputById.get(tb.id);
        sdkInputById.delete(tb.id);
        return [toolStartFrame(tb, input)];
      }
      const parsed = parseDeltaJson(tb);
      if (parsed.ok) return [toolStartFrame(tb, parsed.args)];
      awaitingSdkInput.set(tb.id, tb);
      return [];
    }
    return [];
  }

  function onAssistantMessage(content: unknown): WireEvent[] {
    if (!Array.isArray(content)) return [];
    const out: WireEvent[] = [];
    for (const block of content as AssistantContentBlock[]) {
      if (block?.type !== "tool_use" || !block.id) continue;
      if (!toolNameById.has(block.id)) continue;
      const waiting = awaitingSdkInput.get(block.id);
      if (waiting) {
        awaitingSdkInput.delete(block.id);
        out.push(toolStartFrame(waiting, block.input));
      } else {
        sdkInputById.set(block.id, block.input);
      }
    }
    return out;
  }

  function onUserMessage(
    content: unknown,
    toolUseResult?: unknown,
  ): WireEvent[] {
    return translateToolResults(
      content,
      toolUseResult,
      toolNameById,
      awaitingSdkInput,
    );
  }

  function onTurnEnd(): WireEvent[] {
    const out = [...awaitingSdkInput.values()].map(unverifiedToolStart);
    awaitingSdkInput.clear();
    sdkInputById.clear();
    return out;
  }

  return {
    onMessageStart,
    onStreamEvent,
    onAssistantMessage,
    onUserMessage,
    onTurnEnd,
  };
}
