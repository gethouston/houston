import { join } from "node:path";
import {
  type CompactionCheckpoints,
  createCompactionCheckpoints,
} from "../store/conversation-compaction";

export function turnCompactions(dataDir: string): CompactionCheckpoints {
  return createCompactionCheckpoints(join(dataDir, "conversations"));
}

export function settleClaudeSummary(
  dataDir: string,
  conversationId: string,
  turn: { harness: "claude" | "pi"; freshSession: boolean },
): boolean {
  const checkpoints = turnCompactions(dataDir);
  if (turn.freshSession) {
    checkpoints.clear(conversationId);
    return false;
  }
  return (
    turn.harness === "claude" && checkpoints.read(conversationId) !== undefined
  );
}
