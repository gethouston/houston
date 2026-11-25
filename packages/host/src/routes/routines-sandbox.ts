import type { IncomingMessage, ServerResponse } from "node:http";
import { loadActivities, missionConversationKey } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import { actingDelegatorFromHeader, actingSubFromHeader } from "../auth/acting";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { bearer, header, json, readJson } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { liveTurns } from "./live-turn";
import {
  DELEGATED_ROUTINE_REFUSAL,
  isRoutinePause,
} from "./mission-delegation-refusals";
import { defineRoute } from "./registry";
import { routineAuthoringPin } from "./routine-creation-pin";
import { createRoutineChecked, updateRoutineChecked } from "./routine-write";

defineRoute({
  group: "sandbox-routines",
  method: "POST",
  path: "/sandbox/routines/save",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The agent's save_routine tool calls it with a per-sandbox HMAC token, which is what names the workspace.",
  source: "packages/host/src/routes/routines-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxRoutines(deps, method, path, url, req, res),
});

// WHY: created_by comes from the host's turn record; a loopback acting header is the runtime's word. ADR-0016
export async function handleSandboxRoutines(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    vfs?: Vfs;
    paths?: WorkspacePaths;
    events?: EventHub;
    triggersEnabled?: boolean;
    gatewayFronted?: boolean;
    ownerSub?: string;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/sandbox/routines/save" || method !== "POST") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.vfs) {
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return true;
  }
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  const agent = await deps.store.getAgent(claim.agentId);
  if (!ws || !agent) {
    json(res, 404, { error: "agent not found" });
    return true;
  }

  const paths = deps.paths ?? DEFAULT_PATHS;
  const root = paths.agentRoot(ws, agent);
  const nowIso = new Date().toISOString();
  const triggersEnabled = deps.triggersEnabled ?? false;
  const claimedConversationId = header(req, CONVERSATION_ID_HEADER);
  const turn = claimedConversationId
    ? liveTurns.get(claim.agentId, claimedConversationId)
    : undefined;
  const body = await readJson(req);
  if (turn) {
    const delegated = deps.gatewayFronted
      ? Boolean(actingDelegatorFromHeader(turn.actingAs))
      : (await loadActivities(deps.vfs, root)).items.some(
          (item) =>
            missionConversationKey(item) === turn.conversationId &&
            Boolean(item.origin_session_key),
        );
    if (delegated && !isRoutinePause(body)) {
      json(res, 409, {
        code: "mission_depth",
        error: DELEGATED_ROUTINE_REFUSAL,
      });
      return true;
    }
  }
  const createdBy = deps.gatewayFronted
    ? (actingSubFromHeader(turn?.actingAs) ?? deps.ownerSub)
    : ws.ownerUserId;
  const emit = (event: HoustonEvent) =>
    deps.events?.emit(ws.ownerUserId, event);

  const { id, ...fields } = body;
  const creating = typeof id !== "string" || id === "";
  const authoringPin = creating
    ? await routineAuthoringPin({
        vfs: deps.vfs,
        root,
        fields,
        turnPin: turn?.pin,
      })
    : undefined;
  const minIntervalMinutes = turn?.limits?.routineMinIntervalMinutes;
  const floor = minIntervalMinutes ? { minIntervalMinutes } : {};
  const result = !creating
    ? await updateRoutineChecked(deps.vfs, root, ws.id, id, fields, {
        triggersEnabled,
        nowIso,
        actorSub: createdBy,
        ...floor,
      })
    : await createRoutineChecked(deps.vfs, root, ws.id, fields, {
        triggersEnabled,
        nowIso,
        createdBy,
        authoringPin,
        ...floor,
      });

  if ("notFound" in result) {
    json(res, 404, { error: `no routine with id '${String(id)}'` });
    return true;
  }
  if ("error" in result) {
    json(res, 400, result);
    return true;
  }
  emit({ type: "RoutinesChanged", agentPath: agent.id });
  json(res, creating ? 201 : 200, result.routine);
  return true;
}
