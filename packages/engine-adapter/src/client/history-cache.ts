import {
  type CachedFrame,
  readCachedConversation,
} from "../conversation-cache";
import { historyReadMark, seedConversationVm } from "../conversation-seed";

export async function seedFromCache(
  agentPath: string,
  sessionKey: string,
): Promise<CachedFrame[] | null> {
  const mark = historyReadMark(agentPath, sessionKey);
  const frames = await readCachedConversation(agentPath, sessionKey);
  if (frames && frames.length > 0) {
    seedConversationVm(agentPath, sessionKey, frames, mark);
  }
  return frames;
}

export async function cachedFallbackTranscript(
  agentPath: string,
  sessionKey: string,
  alreadyRead: CachedFrame[] | null,
): Promise<CachedFrame[] | null> {
  return alreadyRead ?? (await readCachedConversation(agentPath, sessionKey));
}
