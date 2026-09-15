import { addressesMission } from "@houston/domain";
import type { BoardStatus } from "@houston/sdk";
import type { PendingInteraction } from "@houston/wire-types";
import * as activities from "../activities";
import { emitLocalEcho } from "../bus";
import { agentPath as agentRoute } from "../control-plane";
import type { AdapterContext } from "./context";
import { viaSdk } from "./sdk-error";

/**
 * Transition a chat activity's board status, honoring cloud vs standalone mode.
 * The board READS activities from the host in cloud mode (listActivities →
 * control plane), so a turn's status write MUST reach the host too — a
 * localStorage write (the standalone store) would never show up on the board
 * and the card would hang in "running". Matches by session_key, or the
 * `activity-<id>` convention the board uses for missions with no explicit key.
 *
 * Shared by the chat mixin's `startSession` / `cancelSession` / `loadChatHistory`
 * observe paths, so it takes the {@link AdapterContext} rather than living on any
 * one of them.
 */
export async function setActivityStatus(
  ctx: AdapterContext,
  agentPath: string,
  sessionKey: string,
  status: BoardStatus,
  pendingInteraction: PendingInteraction | null,
): Promise<void> {
  if (!ctx.cp) {
    activities.setStatusBySessionKey(
      agentPath,
      sessionKey,
      status,
      pendingInteraction,
    );
    // Write-through echo: this is the settle path (a turn finishing PATCHes
    // its board status). Without it the card sticks on "running" until a
    // server event that, in hosted mode, historically never comes.
    emitLocalEcho("ActivityChanged", { agentPath });
    return;
  }
  // This write MUST land: the turn flipped its card to "running", and a
  // turn guarantees a terminal status on exit — a lost settle write leaves
  // the mission visibly stuck on "running" forever. The PATCH is idempotent
  // (fixed status + interaction), so retrying a network blip or proxy
  // hiccup is safe. cpFetch deliberately never blind-retries writes; this
  // caller knows its write is replay-safe.
  const retryDelaysMs = [500, 1500, 3000];
  // The SDK serves both halves (byte-identical GET then PATCH, neither
  // refetching); `viaSdk` keeps the adapter's error shape and stuck-wake signal.
  const board = `${agentRoute(agentPath)}/activities`;
  for (let i = 0; ; i++) {
    try {
      const list = await viaSdk(board, () =>
        ctx.sdk.activities.list(agentPath),
      );
      const match = list.find((a) => addressesMission(a, sessionKey));
      if (!match) return; // transient session with no board card — nothing to update
      // `pending_interaction: null` clears it explicitly (the host route +
      // domain applyActivityUpdate honor null); a value records the interaction.
      await viaSdk(`${board}/${encodeURIComponent(match.id)}`, () =>
        ctx.sdk.activities.writes.update(agentPath, match.id, {
          status,
          pending_interaction: pendingInteraction,
        }),
      );
      break;
    } catch (err) {
      if (i >= retryDelaysMs.length) throw err;
      await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
    }
  }
  emitLocalEcho("ActivityChanged", { agentPath });
}
