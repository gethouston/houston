import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { actingSubFromHeader } from "../auth/acting";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { bearer, header, json, readJson } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { liveTurns } from "./live-turn";
import { createRoutineChecked, updateRoutineChecked } from "./routine-write";

/**
 * The RUNTIME-facing scheduled-task write route (`POST /sandbox/routines/save`,
 * authed by the per-sandbox HMAC token). The agent's `save_routine` tool calls
 * THIS instead of writing `.houston/routines/routines.json` with file tools.
 *
 * WHY it exists: each setup chat is isolated and only knows its own routine, so a
 * wholesale file write (the old prompt) made creating task #2 overwrite task #1.
 * This route merge-saves through the SAME read-modify-write the authenticated
 * agent-data route uses (loadRoutines -> create/apply -> upsertById ->
 * saveRoutines), so a second write never clobbers a first. The gate + write live
 * in routine-write.ts; this handler only resolves the sandbox to its workspace
 * and relays validation errors as tool-actionable JSON.
 *
 * A body with an `id` updates that routine in place; without one it creates a new
 * routine alongside the existing set.
 */
export async function handleSandboxRoutines(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    vfs?: Vfs;
    paths?: WorkspacePaths;
    events?: EventHub;
    /**
     * Whether this deployment can fire event-driven routines (a trigger backend
     * exists — Houston Cloud only). When false, a save carrying a `trigger`
     * binding is rejected: it could never wake here. Mirrors the agent-data gate.
     */
    triggersEnabled?: boolean;
    /**
     * True only when a trusted gateway fronts every request (the managed pod).
     * Then the acting-as header sub is recorded as the routine's `created_by`;
     * on the desktop the header is untrusted client input and the workspace
     * owner is recorded instead. Mirrors routes/agents.ts routineActor.
     */
    gatewayFronted?: boolean;
    /** Org-owner fallback creator when no acting header decodes (mirrors
     *  ControlPlaneDeps.ownerSub). */
    ownerSub?: string;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/sandbox/routines/save" || method !== "POST") return false;

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/credential.
  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.vfs) {
    // Same stable code the generic sandbox proxies use, so the runtime tool
    // renders the honest "not available in this install" speech act.
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
  // WHO the routine records as its creator (C2): on a managed pod, the person
  // the HOST recorded when it started the turn this call speaks in
  // (routes/live-turn.ts, matched by the conversation the runtime names). A
  // loopback /sandbox call is not gateway-fronted, so an acting-as header on
  // THIS request is the runtime's own word and is never read. No recorded
  // turn falls back to the org owner (an authorless routine is not fireable
  // by the control-plane planner); off the gateway the workspace owner.
  const claimedConversationId = header(req, CONVERSATION_ID_HEADER);
  const turn = claimedConversationId
    ? liveTurns.get(claim.agentId, claimedConversationId)
    : undefined;
  const createdBy = deps.gatewayFronted
    ? (actingSubFromHeader(turn?.actingAs) ?? deps.ownerSub)
    : ws.ownerUserId;
  // A successful write reacts on the SAME channel a UI or file-watcher write does
  // (saveRoutines writes the file the host watches); scope to the workspace owner.
  const emit = (event: HoustonEvent) =>
    deps.events?.emit(ws.ownerUserId, event);

  const body = await readJson(req);
  // `id` selects update-in-place; it is never a routine field itself.
  const { id, ...fields } = body;
  const result =
    typeof id === "string" && id !== ""
      ? await updateRoutineChecked(deps.vfs, root, ws.id, id, fields, {
          triggersEnabled,
          nowIso,
          actorSub: createdBy,
        })
      : await createRoutineChecked(deps.vfs, root, ws.id, fields, {
          triggersEnabled,
          nowIso,
          createdBy,
        });

  if ("notFound" in result) {
    json(res, 404, { error: `no routine with id '${String(id)}'` });
    return true;
  }
  if ("error" in result) {
    json(res, 400, { error: result.error });
    return true;
  }
  emit({ type: "RoutinesChanged", agentPath: agent.id });
  json(res, typeof id === "string" && id !== "" ? 200 : 201, result.routine);
  return true;
}
