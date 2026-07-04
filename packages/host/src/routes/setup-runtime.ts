import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, UserId, WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import { json, readJson } from "./http";

/**
 * User-level provider connection for FIRST-RUN, before any agent exists.
 *
 * Provider OAuth executes inside a pi runtime, but the onboarding connects the
 * user's AI BEFORE the first agent is created (the Rust engine's login was
 * global, and the product flow keeps that order). These routes run the login
 * in a dedicated, hidden SETUP runtime instead of an agent's:
 *
 *  - The synthetic agent id lives under a dot-directory, so the local FS store
 *    never lists it as a workspace or agent (`listDirs` skips dot names) and
 *    the runtime's scratch dir stays out of the user's sight.
 *  - Its `workspaceId` IS the user's personal workspace, so a captured
 *    credential lands exactly where `/sandbox/credential` serves every real
 *    agent runtime from — the agent created right after first-run is already
 *    connected.
 *  - Only the connect surface is exposed (providers, auth status, login,
 *    login/complete, capture, api-key). Everything else the runtime serves
 *    (chat, files, settings) stays agent-scoped; notably `auth/export` is NOT
 *    reachable here — capture pulls it host-side and scrubs, so a refresh
 *    token never crosses to a client.
 *
 * Returns true when the request was handled.
 */

/** The hidden runtime's synthetic agent name within the personal workspace. */
const SETUP_AGENT_NAME = ".setup/connect";

export interface SetupRuntimeDeps {
  store: WorkspaceStore;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
}

/** The runtime sub-paths a pre-agent client may reach, nothing more. */
function allowedRest(method: string, rest: string): boolean {
  if (method === "GET") return rest === "providers" || rest === "auth/status";
  if (method === "POST") {
    return /^auth\/[^/]+\/login(\/complete)?$/.test(rest);
  }
  return false;
}

export async function handleSetupRuntime(
  deps: SetupRuntimeDeps,
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/setup-runtime" && !path.startsWith("/setup-runtime/")) {
    return false;
  }
  const rest = path.slice("/setup-runtime/".length);

  // Resolve the caller's personal workspace (auto-provisioned on first touch)
  // and shape the synthetic agent the channel keys the runtime on.
  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  const agent: Agent = {
    id: `${ws.id}/${SETUP_AGENT_NAME}`,
    workspaceId: ws.id,
    name: SETUP_AGENT_NAME,
    createdAt: 0,
  };
  const channel = deps.channels[ws.runtime];
  if (!channel) {
    json(res, 503, { error: `${ws.runtime} runtime not configured` });
    return true;
  }
  const ctx = { workspace: ws, agent };

  // Connect-once capture: store the setup runtime's fresh credential for the
  // WHOLE personal workspace and scrub its refresh token — identical to the
  // per-agent `/agents/:id/credential/capture`, minus the agent.
  if (rest === "credential/capture" && method === "POST") {
    const body = (await readJson(req).catch(() => ({}))) as {
      provider?: unknown;
    };
    const provider =
      typeof body.provider === "string" ? body.provider : undefined;
    const result = await channel.captureCredential(ctx, provider);
    if (result.ok) json(res, 200, { ok: true, provider: result.provider });
    else
      json(res, result.status, {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      });
    return true;
  }

  // API-key provider connect (no OAuth dance): store centrally + push into the
  // setup runtime so `auth/status` reads connected immediately.
  if (rest === "credential/api-key" && method === "POST") {
    const { provider, apiKey } = await readJson(req);
    if (!provider || typeof provider !== "string") {
      json(res, 400, { error: "missing 'provider'" });
      return true;
    }
    if (!apiKey || typeof apiKey !== "string") {
      json(res, 400, { error: "missing 'apiKey'" });
      return true;
    }
    await channel.saveApiKeyCredential(ctx, provider, apiKey);
    json(res, 200, { ok: true });
    return true;
  }

  if (!allowedRest(method, rest)) {
    json(res, 404, { error: "not found" });
    return true;
  }
  await channel.dispatch(ctx, method, rest, url, req, res);
  return true;
}
