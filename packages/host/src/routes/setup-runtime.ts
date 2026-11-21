import type { Agent } from "../domain/types";
import { json } from "./http";
import { defineRouteFamily, type HttpMethod, matchPath } from "./registry";
import {
  handleSetupCredential,
  SETUP_CREDENTIAL_RESTS,
} from "./setup-runtime-credentials";

const SOURCE = "packages/host/src/routes/setup-runtime.ts";

const SETUP_AGENT_NAME = ".setup/connect";

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

const onConnectSurface = (method: string, path: string): boolean =>
  MEMBERS.some(
    (member) => member.method === method && matchPath(member.path, path),
  );

defineRouteFamily({
  group: "setup-runtime",
  members: MEMBERS,
  owns: ["/setup-runtime", "/setup-runtime/", "/setup-runtime/*rest"],
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  handler: async ({ deps, userId, method, path, url, req, res }) => {
    const rest = path.slice("/setup-runtime/".length);

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
    if (!onConnectSurface(method, path))
      return json(res, 404, { error: "not found" });
    await channel.dispatch(ctx, method, rest, url, req, res);
  },
});
