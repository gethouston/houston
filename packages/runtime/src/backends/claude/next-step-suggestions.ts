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

/** Only native Claude history can make a resumed model call its former tool. */
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
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line.includes("mcp__houston__suggest_actions")) continue;
    const entry = AssistantEntry.safeParse(JSON.parse(line));
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

/**
 * A resumed model sees success and no offers are recorded. After a closing
 * message it still ends the turn like the real tool, because the SDK would
 * otherwise call the model again and it repeats its reply.
 */
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
