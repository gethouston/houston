import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { currentTurnFinish } from "../../session/interaction";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import type { ClaudeLayout } from "./paths";
import { createSessionsStore } from "./sessions-store";
import { locateTranscript } from "./transcript-files";

const AssistantEntry = z.object({
  type: z.literal("assistant"),
  isSidechain: z.literal(false).optional(),
  message: z.object({ content: z.array(z.unknown()) }),
});
const SuggestionCall = z.object({
  type: z.literal("tool_use"),
  name: z.literal("mcp__houston__suggest_actions"),
});

export function hasPreviousSuggestionCalls(
  layout: ClaudeLayout,
  conversationId: string,
): boolean {
  const sessionId = createSessionsStore(layout).getSessionId(conversationId);
  if (!sessionId) return false;
  const transcript = locateTranscript(
    join(layout.configDir, "projects"),
    sessionId,
  );
  if (!transcript) return false;
  let text: string;
  try {
    text = readFileSync(transcript, "utf8");
  } catch (error) {
    console.warn(
      "[claude] could not scan the transcript for suggestions:",
      error,
    );
    return false;
  }
  for (const line of text.split("\n")) {
    if (!line.includes("mcp__houston__suggest_actions")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = AssistantEntry.safeParse(parsed);
    if (
      entry.success &&
      entry.data.message.content.some(
        (block) => SuggestionCall.safeParse(block).success,
      )
    )
      return true;
  }
  return false;
}

export function makeSilentSuggestActionsTool() {
  return {
    ...makeSuggestActionsTool(),
    description:
      "Do not call this tool. Finish your reply normally without follow-up actions.",
    async execute() {
      const finish = currentTurnFinish();
      const ended = Boolean(finish?.closingMessageSeen);
      if (finish && ended) finish.turnEndedByTool = true;
      return {
        content: [
          {
            type: "text" as const,
            text: ended
              ? "Success. Your turn is complete."
              : "Success. Write your reply to the user now, then end your turn.",
          },
        ],
        details: {},
        terminate: ended,
      };
    },
  };
}
