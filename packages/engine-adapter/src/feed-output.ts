import {
  type BoardPersistOptions,
  type BoardStatus,
  type FeedOutput,
  type PendingInteraction,
  type SessionStatusValue,
  turnFailureReport,
} from "@houston/sdk";
import { emitEvent } from "./bus";
import { isEngineWakingError } from "./engine-waking-error";
import { reportAdapterError } from "./error-sink";
import { publishFirstResponse } from "./first-responses";
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
    opts?: BoardPersistOptions,
  ) => Promise<void>,
): FeedOutput {
  return {
    pushFeedItem(agentPath, sessionKey, item) {
      // A turn the SDK settled as failed before it could start: the chat line
      // is the person's whole surface, the report is ours.
      const report = turnFailureReport(item, sessionKey);
      if (report) reportAdapterError(report.source, report.error);
      emitEvent("FeedItem", {
        agent_path: agentPath,
        session_key: sessionKey,
        item: remapProvider(item),
      });
    },
    sessionStatus(
      agentPath,
      sessionKey,
      status: SessionStatusValue,
      error,
      detail,
    ) {
      // `error_class` / `origin` are additive and only present when the SDK
      // stamped them; a consumer written for the bare shape reads nothing new.
      emitEvent("SessionStatus", {
        agent_path: agentPath,
        session_key: sessionKey,
        status,
        error,
        ...(detail?.errorClass ? { error_class: detail.errorClass } : {}),
        ...(detail?.origin ? { origin: detail.origin } : {}),
        ...(detail?.stopReason ? { stop_reason: detail.stopReason } : {}),
      });
    },
    firstResponse(agentPath, sessionKey, response) {
      publishFirstResponse({ agentPath, sessionKey, response });
    },
    async persistBoardStatus(
      agentPath,
      sessionKey,
      status,
      pendingInteraction,
      opts,
    ) {
      try {
        await setActivityStatus(
          agentPath,
          sessionKey,
          status,
          pendingInteraction ?? null,
          opts,
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
        // An early hand-back (or its take-back) is a forecast the settle's
        // own write follows: the person has nothing to try again, so it is
        // reported, never put in the transcript.
        if (opts?.provisional) {
          reportAdapterError("feed-output.provisional-board-status", e);
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
