import type { ModelCallReport, PendingInteraction } from "@houston/protocol";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import { config } from "../config";

const REQUEST_TIMEOUT_MS = 5_000;

export interface MissionSettleOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
}

export function reportMissionSettle(
  conversationId: string,
  status: "needs_you" | "error",
  pendingInteraction: PendingInteraction | null,
  turnId: string,
  stopped: boolean,
  modelCalls?: ModelCallReport,
  opts: MissionSettleOptions = {},
): void {
  if (!config.controlPlaneUrl || !config.sandboxToken) return;
  const base = config.controlPlaneUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  void fetchWithRetry(
    (url, init) =>
      fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    `${base}/sandbox/missions/settle`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.sandboxToken}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        turn_id: turnId,
        stopped,
        status,
        pending_interaction: pendingInteraction,
        ...(modelCalls ? { model_calls: modelCalls } : {}),
      }),
    },
    opts.retryDelaysMs ? { delaysMs: opts.retryDelaysMs } : {},
  )
    .then((response) => response.body?.cancel())
    .catch((err) => {
      console.warn(
        `[missions] settle report failed for ${conversationId}; settle-from-history will heal:`,
        err,
      );
    });
}
