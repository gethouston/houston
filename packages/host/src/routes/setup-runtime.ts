import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, UserId, WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import { json } from "./http";
import { handleSetupCredential } from "./setup-runtime-credentials";

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
 *    login/complete, cancel, logout, capture, forget, api-key, claude-oauth —
 *    the credential routes live in `setup-runtime-credentials.ts`). Everything
 *    else the runtime serves (chat, files, settings) stays agent-scoped;
 *    notably `auth/export` is NOT reachable here — capture pulls it host-side
 *    and scrubs, so a refresh token never crosses to a client.
 *
 * The hosted gateway mirrors this allowlist verbatim in front of the org's
 * setup pod: a route added here is dead on cloud until it is allowed there too.
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
    // login/cancel is part of the connect surface: the reconnect card's every
    // press goes cancel → launch (the runtime keeps one login slot per
    // provider), so blocking cancel 404s the chain and the login never
    // launches (HOU-676). logout is the sign-out half of the same surface: a
    // space with no agent signs out here, clearing this runtime's own auth
    // copy right after `credential/forget` drops the central one
    // (PRODUCT-1662).
    return /^auth\/[^/]+\/(login(\/(complete|cancel))?|logout)$/.test(rest);
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

  if (await handleSetupCredential(channel, ctx, method, rest, url, req, res)) {
    return true;
  }

  if (!allowedRest(method, rest)) {
    json(res, 404, { error: "not found" });
    return true;
  }
  await channel.dispatch(ctx, method, rest, url, req, res);
  return true;
}
