/**
 * The local conversation cache as the chat-history read uses it: the
 * cache-first paint on an OPEN, and the transcript to fall back on when the
 * server says the conversation is gone. The cache's own operations, scoping
 * and disk cap live in `../conversation-cache`.
 */

import {
  type CachedFrame,
  readCachedConversation,
} from "../conversation-cache";
import { seedConversationVm } from "../turn-stream";

/**
 * Paint a chat from the last locally persisted transcript BEFORE the network
 * read lands (HOU-712): a cloud read is HELD by the gateway for the whole
 * engine-pod cold start, so without this the chat shows nothing until it
 * resolves. The seed guards in `seedConversationVm` keep a live or richer VM
 * untouched, so a stale cache can never clobber fresh state.
 *
 * Only a real conversation OPEN pays for this. A bulk scan paints nothing, and
 * one IndexedDB read per mission is pure latency across a whole board of them
 * (HOU-941) — it takes {@link cachedFallbackTranscript} instead, lazily.
 */
export async function seedFromCache(
  agentPath: string,
  sessionKey: string,
): Promise<CachedFrame[] | null> {
  const frames = await readCachedConversation(agentPath, sessionKey);
  if (frames && frames.length > 0) {
    seedConversationVm(agentPath, sessionKey, frames);
  }
  return frames;
}

/**
 * The transcript to serve on a 404. A 404 with a locally cached transcript is
 * NOT proof the chat never existed: an engine pod can answer 404 while its data
 * is lost or not yet restored (volume recreation, seed self-heal window). The
 * local copy is the user's only surviving transcript then — serve it and KEEP
 * it (HOU-731). A truly deleted conversation drops out of the conversation
 * list, so nothing reopens its cached ghost; the size cap prunes the orphan.
 *
 * `alreadyRead` is the open path's seed, so it never reads the cache twice; a
 * bulk scan passes null and pays for the read only in this rare corner.
 */
export async function cachedFallbackTranscript(
  agentPath: string,
  sessionKey: string,
  alreadyRead: CachedFrame[] | null,
): Promise<CachedFrame[] | null> {
  return alreadyRead ?? (await readCachedConversation(agentPath, sessionKey));
}
