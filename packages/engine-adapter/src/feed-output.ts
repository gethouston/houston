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
        if (isEngineWakingError(e) || isNetworkTransportError(e)) {
          console.warn("[feed-output] board status update deferred:", e);
          return;
        }
        if (opts?.provisional) {
          reportAdapterError("feed-output.provisional-board-status", e);
          return;
        }
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
