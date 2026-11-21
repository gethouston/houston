import { join } from "node:path";
import { config } from "../config";
import { loadConversation } from "./conversation-file";
import { refusesInteractionAnswer } from "./interaction-owner";

const dir = join(config.dataDir, "conversations");

export function storedCardRefuses(
  id: string,
  actingUserId: string | undefined,
): boolean {
  if (!actingUserId) return false;
  return refusesInteractionAnswer(
    loadConversation(dir, id)?.messages ?? [],
    actingUserId,
  );
}
