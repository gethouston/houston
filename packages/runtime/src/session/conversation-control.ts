import type { TurnMode } from "@houston/protocol";
import { config } from "../config";
import { publish } from "./bus";
import { conversations } from "./conversation-cache";
import { clearNativeSessionState } from "./native-session-state";

export function setLiveTurnMode(id: string, mode: TurnMode): boolean {
  const conv = conversations.get(id);
  if (!conv?.liveMode) return false;
  conv.liveMode.current = mode;
  return true;
}

export async function cancelTurn(id: string): Promise<boolean> {
  const conv = conversations.get(id);
  if (!conv) return false;
  if (conv.turnId) conv.stoppedTurnId = conv.turnId;
  publish(id, {
    type: "error",
    data: { message: STOPPED_BY_USER },
    turnId: conv.turnId,
  });
  await conv.session.abort();
  return true;
}

export const STOPPED_BY_USER = "Stopped by user";

export async function disposeConversation(
  id: string,
  opts?: { deleteSessions?: boolean },
): Promise<void> {
  const conv = conversations.get(id);
  if (conv) {
    conversations.delete(id);
    await conv.session.abort();
    conv.session.dispose();
  }
  if (opts?.deleteSessions) clearNativeSessionState(config.dataDir, id);
}
