import { restoreArchivedTurn } from "./conversation-archive-cut";
import { loadConversation, saveConversation } from "./conversation-file";

export function truncateConversationMutationAt(
  dir: string,
  id: string,
  turnId: string,
) {
  const conv = loadConversation(dir, id);
  if (!conv) return null;
  const at = conv.messages.findIndex((m) => m.turnId === turnId);
  let removed: number;
  if (at === -1) {
    const restored = restoreArchivedTurn(dir, conv, turnId);
    if (restored === null) return null;
    removed = restored;
  } else {
    removed = conv.messages.length - at;
    conv.messages = conv.messages.slice(0, at);
  }
  delete conv.claudeCompaction;
  conv.needsSessionReplay = true;
  conv.updatedAt = Date.now();
  saveConversation(dir, conv);
  return { removed, conversation: conv };
}

export function consumeSessionReplayAt(dir: string, id: string): boolean {
  const conv = loadConversation(dir, id);
  if (!conv?.needsSessionReplay) return false;
  delete conv.needsSessionReplay;
  saveConversation(dir, conv);
  return true;
}

export function stampSessionReplayAt(dir: string, id: string): boolean {
  const conv = loadConversation(dir, id);
  if (!conv) return false;
  conv.needsSessionReplay = true;
  saveConversation(dir, conv);
  return true;
}
