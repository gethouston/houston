import type { PendingInteraction } from "@houston/protocol";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import { config } from "../config";

const REQUEST_TIMEOUT_MS = 5_000;

/** Injectable seams for tests: fake fetch, no real timer waits. */
export interface MissionSettleOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
}

/**
 * Report a turn's terminal board state to the host (PRODUCT-1244). Board settle
 * is normally CLIENT-side (the SDK folds the terminal frame and PATCHes the
 * activity) — but a mission the AGENT started may never have a client observing
 * its conversation, so its card would sit on Running forever. The runtime
 * reports every turn end here and the host applies it ONLY to agent-started
 * missions still on `running` (routes/missions-manage.ts), so user-created
 * missions keep the client settle path byte-identical.
 *
 * Fire-and-forget, never turn-fatal: this runs after the turn's terminal frame
 * is already published, with no UI thread to toast on. Network drops retry
 * (the host applies at most one settle per mission, so replays are safe) with
 * a fresh timeout per attempt; a settle that still fails logs a WARN
 * breadcrumb, never a console.error — the pod↔control-plane socket dropping
 * is connectivity, not a Houston fault, and it self-heals when the user opens
 * the mission (settle-from-history).
 */
export function reportMissionSettle(
  conversationId: string,
  status: "needs_you" | "error",
  pendingInteraction: PendingInteraction | null,
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
        status,
        pending_interaction: pendingInteraction,
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
