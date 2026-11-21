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

export type WarmingRowLanding =
  | { kind: "aborted" }
  | { kind: "ready"; rowId: string | null };

export async function landWarmingRow(
  entry: ProvisioningEntry,
  send: PendingWarmingSend,
): Promise<WarmingRowLanding> {
  if (!send.row) return { kind: "ready", rowId: null };
  let rowId: string | null = null;
  try {
    const { status: rowStatus, ...createInput } = send.row;
    const created = await tauriActivity.createWithId(
      entry.agentPath,
      createInput,
    );
    rowId = created.id;
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
