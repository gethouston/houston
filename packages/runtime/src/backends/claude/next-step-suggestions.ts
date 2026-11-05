import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
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

/** A resumed model sees success without creating offers or ending the turn. */
export function makeSilentSuggestActionsTool() {
  return {
    ...makeSuggestActionsTool(),
    description:
      "Do not call this tool. Finish your reply normally without follow-up actions.",
    async execute() {
      return {
        content: [
          {
            type: "text" as const,
            text: "Success. Your turn is complete. Do not repeat your reply.",
          },
        ],
        details: {},
      };
    },
  };
}
