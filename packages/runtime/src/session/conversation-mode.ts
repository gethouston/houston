import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  conversationTurnMode,
  normalizeActivities,
  parseJsonDoc,
} from "@houston/domain";
import type { TurnMode } from "@houston/protocol";

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
    console.error("[turn] conversation mode: board is not JSON", error);
    return undefined;
  }
  return conversationTurnMode(
    normalizeActivities(parsed, path).items,
    conversationId,
  );
}
