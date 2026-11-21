import { join } from "node:path";
import { ACTING_VIA_ASSISTANT } from "@houston/host/src/auth/acting";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import { PrefixedVfs } from "@houston/host/src/vfs";
import type { HoustonEvent } from "@houston/protocol";
import type { OpResult } from "./op-apply";
import { isCustomIntegrationOpRoute } from "./op-route-allowlist";
import {
  CUSTOM_DEFS_FILE,
  type CustomContext,
  customIntegrationContext,
} from "./op-route-custom";
import { agentRouteScope, engineAgentId, importScope } from "./op-scope";
import type { OpRequest } from "./parse-op-request";
import { captureCustomDefinitions } from "./turn-custom-definitions-doc";
import type { TurnFilesystem } from "./turn-filesystem";

type RouteOp = OpRequest & { op: Extract<OpRequest["op"], { kind: "route" }> };

const decline = (include: OpResult["include"]): OpResult => ({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "the pod serves this one" }),
  events: [],
  include,
  decline: true,
});

function routeScope(filesystem: TurnFilesystem, decoded: string) {
  return decoded === "migration/import"
    ? importScope(filesystem.workspaceRel, filesystem.dataRel)
    : agentRouteScope(filesystem.workspaceRel);
}

function oauthAddBody(body: string | undefined): boolean {
  try {
    return JSON.parse(body ?? "{}").auth === "oauth";
  } catch {
    return false;
  }
}

export async function applyRouteOp(
  op: RouteOp,
  filesystem: TurnFilesystem,
  fetchImpl?: typeof fetch,
): Promise<OpResult> {
  const { method, rest } = op.op;
  const decoded = decodeURIComponent(rest);
  const include = routeScope(filesystem, decoded);
  if (
    decoded === "integrations/custom/definitions" &&
    method === "POST" &&
    oauthAddBody(op.op.body) &&
    !op.customOAuthCallbackUrl
  ) {
    return decline(include);
  }

  const custom = isCustomIntegrationOpRoute(decoded)
    ? await customIntegrationContext(op, filesystem, fetchImpl)
    : null;
  try {
    return await runRouteOp(op, filesystem, decoded, custom);
  } finally {
    await custom?.dispose().catch((error: unknown) => {
      console.error("[op] custom-integration executor close failed:", error);
    });
  }
}

async function runRouteOp(
  op: RouteOp,
  filesystem: TurnFilesystem,
  decoded: string,
  custom: CustomContext | null,
): Promise<OpResult> {
  const agentId = engineAgentId(filesystem);
  const include = routeScope(filesystem, decoded);
  const vfs = new PrefixedVfs(filesystem.vfs, "workspaces");
  const dispatch = (
    request: Parameters<typeof dispatchAgentOp>[0]["request"],
  ) =>
    dispatchAgentOp({
      workspacesRoot: join(filesystem.storeRoot, "workspaces"),
      agentId,
      vfs,
      request,
      ...(op.agentName ? { agentName: op.agentName } : {}),
      ...(decoded === "migration/import"
        ? { agentDir: filesystem.workspaceDir }
        : {}),
      ...(custom ? { customIntegrations: custom.manager } : {}),
    });
  const result = await dispatch({
    method: op.op.method,
    rest: op.op.rest,
    ...(op.op.query ? { query: op.op.query } : {}),
    ...(op.op.body !== undefined ? { body: op.op.body } : {}),
    ...(op.op.bodyBase64 !== undefined ? { bodyBase64: op.op.bodyBase64 } : {}),
    ...(op.op.contentType ? { contentType: op.op.contentType } : {}),
    ...(op.actingAs
      ? {
          actingSub: op.actingAs.userId,
          actingAuthor: {
            user_id: op.actingAs.userId,
            ...(op.actingAs.name ? { name: op.actingAs.name } : {}),
          },
          ...(op.actingAs.via === ACTING_VIA_ASSISTANT
            ? { startedBy: "houston" as const }
            : {}),
        }
      : {}),
    triggersEnabled: op.triggersEnabled,
    ...(op.limits?.routineMinIntervalMinutes
      ? { routineFloorMinutes: op.limits.routineMinIntervalMinutes }
      : {}),
  });

  if (
    custom &&
    !op.customOAuthCallbackUrl &&
    decoded === "integrations/custom/detect"
  ) {
    try {
      if (JSON.parse(result.body).requiresOAuth === true)
        return decline(include);
    } catch {}
  }

  const events: HoustonEvent[] = [...result.events];
  const out: OpResult = {
    ...result,
    events,
    include: custom
      ? (rel) => include(rel) || rel === CUSTOM_DEFS_FILE
      : include,
  };
  if (custom && custom.touched.size > 0) {
    events.push({ type: "CustomIntegrationsChanged" });
    out.customDefinitions = await captureCustomDefinitions(
      custom.manager,
      filesystem.storeRoot,
      custom.touched,
    );
  }
  if (result.events.some((e) => e.type === "SkillsChanged")) {
    const view = await dispatch({
      method: "GET",
      rest: "skills",
      triggersEnabled: op.triggersEnabled,
    });
    if (view.status === 200) {
      try {
        out.skillsView = JSON.parse(view.body);
      } catch {}
    }
  }
  return out;
}
