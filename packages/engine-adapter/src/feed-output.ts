import type {
  BoardStatus,
  FeedOutput,
  PendingInteraction,
  SessionStatusValue,
} from "@houston/sdk";
import { emitEvent } from "./bus";
import { isEngineWakingError } from "./engine-waking-error";
import { isNetworkTransportError } from "./network-transport-error";
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
 * "running" — except the two quiet classes, which are expected environment
 * states the surfacing layer already covers (see `persistBoardStatus`).
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
        // A send into an asleep mission starts the turn on the client, and the
        // turn-start persist ("running") lands on a pod still cold-starting:
        // the gateway answers its waking 502/503. Nothing is broken and there
        // is nothing to "try again" — the waking notice already covers the
        // state and the settle re-persists the status once the pod is up — so
        // that answer (and a plain connectivity drop) must not put a line in
        // the transcript. Same quiet classes as `tauri.ts` / `reportError`.
        if (isEngineWakingError(e) || isNetworkTransportError(e)) {
          console.warn("[feed-output] board status update deferred:", e);
          return;
        }
        // The raw cause is dev speak — log it, show product voice (HOU-721).
        console.error("[feed-output] board status update failed:", e);
        emitEvent("FeedItem", {
          agent_path: agentPath,
          session_key: sessionKey,
          item: {
            feed_type: "system_message",
            data: "Couldn't update the board status. Please try again.",
          },
        });
      }
    },
  };
}
