import { clipToolResult, type WireEvent } from "@houston/runtime-client";
import {
  type EventLike,
  parseArgs,
  type ToolBlock,
  toolResultText,
  type UserContentBlock,
} from "./translate-support";

/** The per-turn content-block state behind a translator's stream handling. */
export interface ContentBlockTracker {
  /** SDK `stream_event` frames → text/thinking deltas and tool_start. */
  onStreamEvent(event: EventLike): WireEvent[];
  /** A user message's `tool_result` blocks → tool_end for this turn's tools. */
  onUserMessage(content: unknown): WireEvent[];
}

/**
 * Track the model's content blocks across a turn: tool-call input JSON
 * accumulates across `stream_event` frames (`includePartialMessages: true`), and
 * a tool_use_id→name map lets a later user-message `tool_result` resolve its
 * tool_end.
 */
export function createContentBlockTracker(): ContentBlockTracker {
  const toolBlocks = new Map<number, ToolBlock>();
  const toolNameById = new Map<string, string>();
  // Block-boundary tracking (HOU-857): a turn's text arrives as flat deltas,
  // but the model emits DISTINCT content blocks (text → tool_use → text on the
  // next request). Downstream every consumer concatenates the deltas verbatim
  // — the live feed, the persisted transcript — so without a separator the
  // second block glues onto the first mid-sentence ("…for you now.Go ahead…").
  // When a NEW text block starts after this turn already streamed text, prefix
  // its first delta with a paragraph break. Same for thinking blocks.
  let sawText = false;
  let sawThinking = false;
  let sepText = false;
  let sepThinking = false;

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
      // A FOLLOW-UP text/thinking block: arm the separator; the block's first
      // delta carries it (never emitted standalone, so an empty block can't
      // leave a dangling break).
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
      return [
        { type: "tool_start", data: { name: tb.name, args: parseArgs(tb) } },
      ];
    }
    return [];
  }

  function onUserMessage(content: unknown): WireEvent[] {
    if (!Array.isArray(content)) return [];
    const out: WireEvent[] = [];
    for (const block of content as UserContentBlock[]) {
      if (block?.type !== "tool_result") continue;
      // Only surface results for tools we started THIS turn; an unknown id is a
      // replayed/foreign result (e.g. resume history) and must not emit tool_end.
      const name = block.tool_use_id && toolNameById.get(block.tool_use_id);
      if (!name) continue;
      // Carry the result's text (clipped) so the mission log can show what
      // the tool returned — same contract as the pi backend (HOU-717).
      const content = toolResultText(block.content);
      out.push({
        type: "tool_end",
        data: {
          name,
          isError: !!block.is_error,
          ...(content ? { content: clipToolResult(content) } : {}),
        },
      });
    }
    return out;
  }

  return { onStreamEvent, onUserMessage };
}
