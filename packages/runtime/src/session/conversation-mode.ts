import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  conversationTurnMode,
  normalizeActivities,
  parseJsonDoc,
} from "@houston/domain";
import type { TurnMode } from "@houston/protocol";

/**
 * The mode a send that pins none runs on (HOU-205): the mode kept on the
 * conversation's mission card in this agent's board, read when the turn is
 * accepted. Both runtimes ask it, the standing server with its workspace and a
 * pooled worker with its hydrated tree, so a WhatsApp relay, an API follow-up
 * or any other pin-less send keeps the mode the person picked.
 *
 * `undefined` when there is no board, no card for the conversation, or a card
 * with no mode: the turn then runs "execute". An API-started card with no
 * mode reads as "auto" (`conversationTurnMode`). A board that cannot be read is
 * reported and read the same way, because the person's message must still run.
 */
export async function storedConversationMode(
  agentDir: string,
  conversationId: string,
): Promise<TurnMode | undefined> {
  const path = join(agentDir, ".houston", "activity", "activity.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("[turn] conversation mode: board unreadable", error);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = parseJsonDoc(raw, path);
  } catch (error) {
    // Agents write this file with their own tools, so a half-edited board is
    // a state the turn has to survive.
    console.error("[turn] conversation mode: board is not JSON", error);
    return undefined;
  }
  return conversationTurnMode(
    normalizeActivities(parsed, path).items,
    conversationId,
  );
}
