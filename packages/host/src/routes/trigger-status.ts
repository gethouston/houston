import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json } from "./http";

/**
 * The status detail a trigger-bound routine carries when this deployment has NO
 * trigger backend: it can never wake here, and the user has two concrete ways
 * out. Kept plain and verbatim-relayable (no jargon, no file/JSON talk) because
 * the row badge shows it and the agent may read it to the user.
 */
export const NO_TRIGGER_BACKEND_DETAIL =
  "Event triggers are not available on this device, so this automation cannot wake here. Recreate it on Houston Cloud or switch it to a schedule.";

/**
 * GET /agents/:agentId/trigger-status — one item per trigger-bound routine, in
 * the `{ items }` shape the client parses (engine-client `agentTriggerStatus`).
 * Schedule-only agents get `[]`.
 *
 * This TS host is never a trigger BACKEND: managed cloud's Go control plane owns
 * Composio provisioning + live status and answers this route at its edge — it
 * never proxies here. So the only status this handler can report honestly is the
 * no-backend one: every trigger-bound routine is `error` with a human detail
 * (it cannot wake on a deployment that can't fire triggers).
 *
 * That no-backend answer is the `triggersEnabled === false` branch, kept
 * explicit so the route NEVER lies: on a deployment that CAN fire triggers we do
 * not fabricate a status — we fall through (return false) and leave the answer
 * to the real backend (today the gateway edge; a future in-host backend would
 * add its own branch here rather than inherit the unsupported answer).
 */
export async function handleTriggerStatus(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  res: ServerResponse,
  triggersEnabled: boolean,
): Promise<boolean> {
  if (rest !== "trigger-status" || method !== "GET") return false;
  // Triggers CAN fire here → this host is not the status authority; don't guess.
  if (triggersEnabled) return false;
  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const { items } = await loadRoutines(
    vfs,
    paths.agentRoot(ctx.workspace, ctx.agent),
  );
  const statusItems = items
    .filter((r) => r.trigger != null)
    .map((r) => ({
      routine_id: r.id,
      status: "error" as const,
      detail: NO_TRIGGER_BACKEND_DETAIL,
    }));
  json(res, 200, { items: statusItems });
  return true;
}
