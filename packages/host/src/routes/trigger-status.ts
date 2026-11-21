import type { ServerResponse } from "node:http";
import { loadRoutines } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json } from "./http";
import { defineRoute } from "./registry";

export const NO_TRIGGER_BACKEND_DETAIL =
  "Event triggers are not available on this device, so this automation cannot wake here. Recreate it on Houston Cloud or switch it to a schedule.";

defineRoute({
  group: "trigger-status",
  method: "GET",
  path: "/agents/:agentId/trigger-status",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/trigger-status.ts",
  handler: ({ deps, authz, method, path, res }) =>
    handleTriggerStatus(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      res,
      deps.triggersEnabled ?? false,
    ),
});

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
