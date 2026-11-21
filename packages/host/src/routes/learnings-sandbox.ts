import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { actingAuthorFromHeader } from "../auth/acting";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { bearer, header, json, readJson } from "./http";
import { appendLearningChecked } from "./learning-write";
import { authorizeTurnWrite } from "./plan-gate";
import { defineRoute } from "./registry";

export const CONVERSATION_ID_HEADER = "x-houston-conversation-id";

defineRoute({
  group: "sandbox-learnings",
  method: "POST",
  path: "/sandbox/learnings/save",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The agent's save_learning tool calls it with a per-sandbox HMAC token; provenance comes from the host's record of the running turn.",
  source: "packages/host/src/routes/learnings-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxLearnings(deps, method, path, url, req, res),
});

export async function handleSandboxLearnings(
  deps: {
    vault: CredentialVault;
    store: WorkspaceStore;
    vfs?: Vfs;
    paths?: WorkspacePaths;
    events?: EventHub;
    gatewayFronted?: boolean;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/sandbox/learnings/save" || method !== "POST") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const vfs = deps.vfs;
  if (!vfs) {
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

  const authorized = authorizeTurnWrite(
    claim.agentId,
    header(req, CONVERSATION_ID_HEADER),
  );
  if (!authorized.ok) {
    json(res, authorized.status, authorized.body);
    return true;
  }
  const turn = authorized.turn;

  const body = await readJson(req);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    json(res, 400, { error: "missing 'text'" });
    return true;
  }

  const paths = deps.paths ?? DEFAULT_PATHS;
  const root = paths.agentRoot(ws, agent);
  const taughtBy = deps.gatewayFronted
    ? (actingAuthorFromHeader(turn.actingAs) ??
      (turn.actingUser ? { user_id: turn.actingUser } : null))
    : null;
  const result = await appendLearningChecked(vfs, root, {
    id: randomUUID(),
    text,
    nowIso: new Date().toISOString(),
    ...(taughtBy ? { taughtBy } : {}),
    conversationId: turn.conversationId,
  });
  if ("error" in result) {
    json(res, 400, { error: result.error });
    return true;
  }
  const event: HoustonEvent = { type: "LearningsChanged", agentPath: agent.id };
  deps.events?.emit(ws.ownerUserId, event);

  json(res, 201, result.learning);
  return true;
}
