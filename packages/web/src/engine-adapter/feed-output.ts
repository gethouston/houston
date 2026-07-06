import type {
  BoardStatus,
  FeedOutput,
  PendingInteraction,
  SessionStatusValue,
} from "@houston/sdk";
import { emitEvent } from "./bus";
import { toOldProvider } from "./synthetic";

/**
 * The web adapter's {@link FeedOutput}: bridges the SDK turn machinery onto the
 * desktop's in-process event bus (the `FeedItem` + `SessionStatus` HoustonEvents
 * app/src already consumes) and persists the board-card status through the
 * injected, cloud-aware setter. This is the exact seam the machinery used to
 * emit through directly (`feed-events.ts`), now supplied from the host side.
 */

/**
 * The two feed items that name a provider carry the ENGINE id now; the desktop
 * UI resolves provider names against the OLD ids, so map them on the way out —
 * exactly what `turn-frames.ts`/`turn-settle.ts` did before the extraction.
 */
function remapProvider(item: unknown): unknown {
  const it = item as { feed_type?: string; data?: { provider?: unknown } };
  if (
    (it.feed_type === "provider_switched" ||
      it.feed_type === "provider_error") &&
    it.data &&
    typeof it.data.provider === "string"
  ) {
    return {
      ...it,
      data: { ...it.data, provider: toOldProvider(it.data.provider) },
    };
  }
  return item;
}

/**
 * Build a bus-backed FeedOutput. `setActivityStatus` is the board-card persist
 * seam (localStorage in standalone web, the control plane in cloud); a failure
 * surfaces in the feed as a system message rather than hanging the card in
 * "running".
 */
export function createBusFeedOutput(
  setActivityStatus: (
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction: PendingInteraction | null,
  ) => Promise<void>,
): FeedOutput {
  return {
    pushFeedItem(agentPath, sessionKey, item) {
      emitEvent("FeedItem", {
        agent_path: agentPath,
        session_key: sessionKey,
        item: remapProvider(item),
      });
    },
    sessionStatus(agentPath, sessionKey, status: SessionStatusValue, error) {
      emitEvent("SessionStatus", {
        agent_path: agentPath,
        session_key: sessionKey,
        status,
        error,
      });
    },
    async persistBoardStatus(
      agentPath,
      sessionKey,
      status,
      pendingInteraction,
    ) {
      try {
        await setActivityStatus(
          agentPath,
          sessionKey,
          status,
          pendingInteraction ?? null,
        );
      } catch (e) {
        emitEvent("FeedItem", {
          agent_path: agentPath,
          session_key: sessionKey,
          item: {
            feed_type: "system_message",
            data: `Couldn't update the board status: ${e instanceof Error ? e.message : String(e)}`,
          },
        });
      }
    },
  };
}
