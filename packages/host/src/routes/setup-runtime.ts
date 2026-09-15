import type { Agent } from "../domain/types";
import { json } from "./http";
import { defineRouteFamily, type HttpMethod, matchPath } from "./registry";
import {
  handleSetupCredential,
  SETUP_CREDENTIAL_RESTS,
} from "./setup-runtime-credentials";

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
 *  - Only the connect surface is exposed: the family below enumerates every
 *    reachable sub-path (the credential half lives in
 *    `setup-runtime-credentials.ts`), so everything else the runtime serves
 *    (chat, files, settings) stays agent-scoped and 404s here. Notably
 *    `auth/export` is NOT on the list — capture pulls it host-side and scrubs,
 *    so a refresh token never crosses to a client.
 *
 * The hosted gateway mirrors this allowlist verbatim in front of the org's
 * setup pod: a route added here is dead on cloud until it is allowed there too.
 */

const SOURCE = "packages/host/src/routes/setup-runtime.ts";

/** The hidden runtime's synthetic agent name within the personal workspace. */
const SETUP_AGENT_NAME = ".setup/connect";

/**
 * The sub-paths forwarded to the setup runtime, nothing more.
 *
 * login/cancel is part of the connect surface: the reconnect card's every press
 * goes cancel → launch (the runtime keeps one login slot per provider), so
 * dropping cancel 404s the chain and the login never launches (HOU-676). logout
 * is the sign-out half of the same surface: a space with no agent signs out
 * here, clearing this runtime's own auth copy right after `credential/forget`
 * drops the central one (PRODUCT-1662).
 */
export const SETUP_RUNTIME_RESTS = [
  { method: "GET", rest: "providers" },
  { method: "GET", rest: "auth/status" },
  { method: "POST", rest: "auth/:provider/login" },
  { method: "POST", rest: "auth/:provider/login/complete" },
  { method: "POST", rest: "auth/:provider/login/cancel" },
  { method: "POST", rest: "auth/:provider/logout" },
] as const satisfies readonly { method: HttpMethod; rest: string }[];

const MEMBERS = [...SETUP_CREDENTIAL_RESTS, ...SETUP_RUNTIME_RESTS].map(
  ({ method, rest }) => ({ method, path: `/setup-runtime/${rest}` }),
);

/** Whether the pair is on the connect surface — the allowlist, as a predicate. */
const onConnectSurface = (method: string, path: string): boolean =>
  MEMBERS.some(
    (member) => member.method === method && matchPath(member.path, path),
  );

defineRouteFamily({
  group: "setup-runtime",
  members: MEMBERS,
  // The whole subtree, because both refusals below belong to this family: a
  // sub-path it does not serve is its 404 (the onboarding learns the route is
  // closed, not that the host lost it), and an unwired runtime is its 503 —
  // named after the runtime, and owed for every sub-path, allowed or not.
  owns: ["/setup-runtime", "/setup-runtime/", "/setup-runtime/*rest"],
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  handler: async ({ deps, userId, method, path, url, req, res }) => {
    // The runtime is asked for the sub-path exactly as it arrived: the channel
    // forwards these bytes.
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
    if (!channel)
      return json(res, 503, { error: `${ws.runtime} runtime not configured` });
    const ctx = { workspace: ws, agent };

    if (await handleSetupCredential(channel, ctx, method, rest, url, req, res))
      return;
    // The allowlist is what keeps the rest of the runtime's surface (chat,
    // files, settings) agent-scoped: only the connect pairs are forwarded.
    if (!onConnectSurface(method, path))
      return json(res, 404, { error: "not found" });
    await channel.dispatch(ctx, method, rest, url, req, res);
  },
});
