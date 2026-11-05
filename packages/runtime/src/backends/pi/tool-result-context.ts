import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import {
  CAPPED_TOOLS,
  cappedResultText,
  RESULT_HEAD_CHARS,
} from "../../session/tool-results/cap";
import {
  clearedStub,
  IMAGE_CHARS,
  staleResultIds,
  type ToolResultRef,
} from "../../session/tool-results/clearing";
import {
  type SpillTarget,
  spillToolResult,
  spillToolResultParts,
} from "../../session/tool-results/spill";

/**
 * pi's `transformContext`: what the model is sent of each tool result, before
 * every request. The session file keeps every result whole; only the outgoing
 * context shrinks. An oversized result from a capped tool is cut to its head
 * (session/tool-results/cap.ts), and stale results are cleared in batches
 * (session/tool-results/clearing.ts). Both point at the full result saved in
 * the agent folder, and both are the same on every request for the same
 * history, so the prompt cache only misses when a new batch is cleared.
 */

type AgentMessage = AgentSession["messages"][number];
type ToolResult = Extract<AgentMessage, { role: "toolResult" }>;

export function makeToolResultContext(
  target: SpillTarget,
): (messages: AgentMessage[]) => Promise<AgentMessage[]> {
  // Saving is keyed by content, so this spares re-hashing on every request,
  // and keeps a failed save (null) from being retried and reported again. A
  // capped result saves its text; a cleared one saves every part.
  const saved = new Map<string, string[] | null>();
  const save = (
    result: ToolResult,
    whole: boolean,
    write: () => string[],
  ): string[] | null => {
    const key = `${whole ? "all" : "text"}:${result.toolCallId}`;
    const known = saved.get(key);
    if (known !== undefined) return known;
    let paths: string[] | null = null;
    try {
      paths = write();
    } catch (err) {
      // Unsaved, the result goes out whole: a bigger request, never a lost one.
      console.error(
        `[tool-results] could not save the ${result.toolName} result; sending it whole:`,
        err,
      );
    }
    saved.set(key, paths);
    return paths;
  };

  return async (messages) => {
    const roundOf = new Map<string, number>();
    let rounds = 0;
    const refs: ToolResultRef[] = [];
    for (const message of messages) {
      if (message.role === "assistant") {
        const calls = message.content.filter((c) => c.type === "toolCall");
        for (const call of calls) roundOf.set(call.id, rounds);
        if (calls.length > 0) rounds++;
      } else if (message.role === "toolResult") {
        const round = roundOf.get(message.toolCallId);
        if (round === undefined) continue;
        const { text, images } = parts(message.content);
        refs.push({
          id: message.toolCallId,
          round,
          // What the model carries of it, which for a capped tool is the head.
          chars:
            Math.min(
              text.length,
              CAPPED_TOOLS.has(message.toolName) ? RESULT_HEAD_CHARS : Infinity,
            ) +
            images * IMAGE_CHARS,
        });
      }
    }
    const stale = staleResultIds(refs, rounds);
    return messages.map((message) => {
      if (message.role !== "toolResult") return message;
      const { text, images } = parts(message.content);
      if (stale.has(message.toolCallId)) {
        const paths = save(message, true, () =>
          spillToolResultParts(
            target,
            message.toolName,
            text,
            message.content.filter((c) => c.type === "image"),
          ),
        );
        if (!paths) return message;
        const chars = text.length + images * IMAGE_CHARS;
        return {
          ...message,
          content: [
            { type: "text", text: clearedStub(message.toolName, chars, paths) },
          ],
        };
      }
      if (
        !CAPPED_TOOLS.has(message.toolName) ||
        text.length <= RESULT_HEAD_CHARS
      )
        return message;
      const path = save(message, false, () => [
        spillToolResult(target, message.toolName, text),
      ])?.[0];
      if (!path) return message;
      return {
        ...message,
        content: [
          { type: "text", text: cappedResultText(text, path) },
          ...message.content.filter((c) => c.type === "image"),
        ],
      };
    });
  };
}

function parts(content: readonly (TextContent | ImageContent)[]): {
  text: string;
  images: number;
} {
  let text = "";
  let images = 0;
  for (const c of content) {
    if (c.type === "text") text += text ? `\n${c.text}` : c.text;
    else images++;
  }
  return { text, images };
}
