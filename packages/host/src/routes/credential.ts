import type { IncomingMessage, ServerResponse } from "node:http";
import { isExpiring } from "../credentials/refresh";
import {
  RemoteCredentialBlockedError,
  RemoteCredentialDeadError,
} from "../credentials/remote-store";
import {
  type CredentialStore,
  type CredentialVault,
  isApiKeyCredential,
} from "../ports";
import { answerAccountBlocked } from "./credential-blocked";
import type { CredentialServeHealer } from "./credential-healer";
import { refreshedForServe } from "./credential-refresh";
import { bearer, json } from "./http";
import { defineRoute } from "./registry";

function notConnected(res: ServerResponse, error: string): true {
  json(res, 404, { error }, { "x-houston-not-connected": "1" });
  return true;
}

defineRoute({
  group: "sandbox-credential",
  method: "GET",
  path: "/sandbox/credential",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "An agent runtime serves itself a subscription token with a per-sandbox HMAC token; no client ever holds this surface.",
  source: "packages/host/src/routes/credential.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxCredential(deps, method, path, url, req, res),
});

export async function handleSandboxCredential(
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    gatewayFronted?: boolean;
    credentialHealer?: CredentialServeHealer;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET" || path !== "/sandbox/credential") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const provider = url.searchParams.get("provider") || "openai-codex";
  if (provider === "anthropic" && !deps.gatewayFronted) {
    json(
      res,
      404,
      { error: "anthropic is not served on this deployment" },
      { "x-houston-not-connected": "1", "x-houston-not-served-here": "1" },
    );
    return true;
  }
  const actingHeader = req.headers["x-houston-acting-as"];
  const actingAs = Array.isArray(actingHeader) ? actingHeader[0] : actingHeader;
  const acting = actingAs ? { actingAs } : undefined;
  if (url.searchParams.get("fresh") === "1")
    deps.credentials.invalidate?.(provider, acting);
  let deadError: RemoteCredentialDeadError | undefined;
  let cred = null;
  try {
    cred = await deps.credentials.get(claim.workspaceId, provider, acting);
  } catch (error) {
    if (error instanceof RemoteCredentialBlockedError)
      return answerAccountBlocked(res, error.detail);
    if (!(error instanceof RemoteCredentialDeadError)) throw error;
    deadError = error;
  }
  if (!cred && deps.credentialHealer) {
    const healed = await deps.credentialHealer.attempt({
      workspaceId: claim.workspaceId,
      agentId: claim.agentId,
      provider,
      actingAs,
    });
    if (healed)
      cred = await deps.credentials.get(claim.workspaceId, provider, acting);
  }
  if (!cred) {
    if (deadError) throw deadError;
    return notConnected(res, "workspace not connected");
  }
  const refreshed = await refreshedForServe(
    deps.credentials,
    claim.workspaceId,
    cred,
    acting,
  );
  if ("notConnected" in refreshed)
    return notConnected(res, refreshed.notConnected);
  if ("blocked" in refreshed)
    return answerAccountBlocked(res, refreshed.blocked.detail);
  cred = refreshed.cred;
  if (cred.provider === "anthropic" && isExpiring(cred))
    return notConnected(res, "anthropic credential is stale");
  json(res, 200, {
    provider: cred.provider,
    access: cred.accessToken,
    expires: cred.expiresAt,
    accountId: cred.accountId ?? null,
    kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
    enterpriseUrl: cred.enterpriseUrl ?? null,
    scope: cred.scope ?? "team",
  });
  return true;
}
