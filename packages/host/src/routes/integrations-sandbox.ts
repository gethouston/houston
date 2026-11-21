import type { IncomingMessage, ServerResponse } from "node:http";
import { FileArgumentError } from "../integrations/file-staging";
import { IntegrationSigninRequiredError } from "../integrations/types";
import type { CredentialVault, WorkspaceStore } from "../ports";
import { bearer, header, json, optionalTrimmed, readJson } from "./http";
import {
  type IntegrationDeps,
  relayIntegrationUpstreamError,
  signinRequired,
} from "./integrations";
import { executeIntegration, searchIntegrations } from "./integrations-fanout";
import {
  type SandboxFileDeps,
  stageSandboxFiles,
} from "./integrations-sandbox-files";
import { defineRouteFamily } from "./registry";

export { providerForAction } from "./integrations-fanout";

defineRouteFamily({
  group: "sandbox-integrations",
  members: [
    { method: "POST", path: "/sandbox/integrations/search" },
    { method: "POST", path: "/sandbox/integrations/execute" },
  ],
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The runtime's tools call these with a per-sandbox HMAC token so no integration secret ever sits in the agent.",
  source: "packages/host/src/routes/integrations-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxIntegrations(deps, method, path, url, req, res),
});

async function handleSandboxIntegrations(
  deps: SandboxFileDeps & {
    vault: CredentialVault;
    store: WorkspaceStore;
    integrations?: IntegrationDeps;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = path.match(/^\/sandbox\/integrations\/(search|execute)$/);
  if (!m || method !== "POST") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  if (!deps.integrations) {
    json(res, 503, {
      error: "integrations not configured",
      code: "integrations_not_configured",
    });
    return true;
  }
  const { registry } = deps.integrations;

  const body = await readJson(req);
  const explicit =
    typeof body.provider === "string" && registry.has(body.provider)
      ? body.provider
      : null;
  if (typeof body.provider === "string" && explicit === null) {
    json(res, 404, {
      error: `unknown integration provider '${body.provider}'`,
    });
    return true;
  }

  const ws = await deps.store.getWorkspace(claim.workspaceId);
  if (!ws) {
    json(res, 404, { error: "workspace not found" });
    return true;
  }

  const actingAs = header(req, "x-houston-acting-as");
  const actingUser = header(req, "x-houston-acting-user");
  const acting = actingAs || actingUser ? { actingAs, actingUser } : undefined;

  try {
    if (m[1] === "search") {
      const query = body.query;
      if (typeof query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return true;
      }
      const app = optionalTrimmed(body.app);
      json(
        res,
        200,
        await searchIntegrations({
          registry,
          userId: ws.ownerUserId,
          query,
          acting,
          app,
          provider: explicit ?? undefined,
        }),
      );
      return true;
    }

    const action = body.action;
    if (typeof action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    const account =
      typeof body.account === "string" && body.account
        ? body.account
        : undefined;

    const provider = explicit ?? undefined;
    const target = { registry, userId: ws.ownerUserId, action, acting };
    const staged = await stageSandboxFiles(deps, {
      ...target,
      workspace: ws,
      agentId: claim.agentId,
      params,
      provider,
    });
    json(
      res,
      200,
      await executeIntegration({
        ...target,
        params: staged,
        account,
        provider,
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof FileArgumentError) {
      json(res, 200, { successful: false, error: err.message });
      return true;
    }
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return true;
    }
    if (relayIntegrationUpstreamError(res, err)) return true;
    throw err;
  }
}
