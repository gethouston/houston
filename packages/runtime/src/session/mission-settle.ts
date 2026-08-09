import type { PendingInteraction } from "@houston/protocol";
import { config } from "../config";

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
 * is already published, with no UI thread to toast on — the one sanctioned
 * log-only context. A missed settle self-heals when the user opens the mission
 * (settle-from-history).
 */
export function reportMissionSettle(
  conversationId: string,
  status: "needs_you" | "error",
  pendingInteraction: PendingInteraction | null,
): void {
  if (!config.controlPlaneUrl || !config.sandboxToken) return;
  const base = config.controlPlaneUrl.replace(/\/$/, "");
  void fetch(`${base}/sandbox/missions/settle`, {
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
  }).catch((err) => {
    console.error(
      `[missions] settle report failed for ${conversationId}:`,
      err,
    );
  });
}
