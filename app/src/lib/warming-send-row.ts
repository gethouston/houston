/**
 * The board row of a queued warming send (`warming-sends.ts`): landed at
 * flush time, once the engine is awake, and settled when its turn never goes
 * out.
 */

import type { ActivityStatus } from "@houston/engine-adapter";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning/entry";
import { getEngine } from "./engine";
import { reportError } from "./error-report";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { tauriActivity } from "./tauri";
import { abortsFlushAsAgentGone } from "./warming-send-wire";

/** `aborted` = the agent is gone: the flush stops. */
export type WarmingRowLanding =
  | { kind: "aborted" }
  | { kind: "ready"; rowId: string | null };

/**
 * Lands the send's board row. The engine is awake now, and the id-upsert makes
 * a retry of an already-landed row a no-op. A failure loses only the card: the
 * message still delivers, so it resolves `ready` with no row id.
 */
export async function landWarmingRow(
  entry: ProvisioningEntry,
  send: PendingWarmingSend,
): Promise<WarmingRowLanding> {
  if (!send.row) return { kind: "ready", rowId: null };
  let rowId: string | null = null;
  try {
    // `status` settles via the patch below — the create route can't
    // carry it, and its zod may reject unknown keys.
    const { status: rowStatus, ...createInput } = send.row;
    const created = await tauriActivity.createWithId(
      entry.agentPath,
      createInput,
    );
    rowId = created.id;
    // One patch for whatever the create couldn't carry: a non-standard
    // session key — a `welcome-` chat, or version skew where an engine
    // predating client-supplied ids (HOU-693) assigned its own id — so
    // the board card still opens THIS conversation and the turn's status
    // writes still resolve (both match session_key first); plus a status
    // settled while queued (the welcome card's needs_you).
    const patch: { session_key?: string; status?: ActivityStatus } = {};
    if (send.sessionKey !== `activity-${created.id}`) {
      patch.session_key = send.sessionKey;
    }
    if (rowStatus && rowStatus !== created.status) {
      patch.status = rowStatus;
    }
    if (Object.keys(patch).length > 0) {
      await getEngine().updateActivity(entry.agentPath, created.id, patch);
    }
  } catch (e) {
    if (abortsFlushAsAgentGone(e)) return { kind: "aborted" };
    showErrorToast(
      "warming_sends_row",
      "mission row create/update failed",
      undefined,
      { userMessage: i18n.t("chat:errors.missionRowFailed") },
    );
  }
  return { kind: "ready", rowId };
}

/**
 * Settles a landed row whose turn never went out: a created row carries the
 * default `running` status and only a turn ever moves it, so without this the
 * card spins over an empty chat forever. False = the agent is gone: stop.
 */
export async function settleWarmingRow(
  entry: ProvisioningEntry,
  row: { id: string; status: ActivityStatus },
  send: PendingWarmingSend,
): Promise<boolean> {
  try {
    await getEngine().updateActivity(entry.agentPath, row.id, {
      status: row.status,
    });
  } catch (e) {
    if (abortsFlushAsAgentGone(e)) return false;
    reportError(
      "warming_sends_row_settle",
      `settling an unsent mission row failed (session ${send.sessionKey})`,
      e,
    );
  }
  return true;
}
