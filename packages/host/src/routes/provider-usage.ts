import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialStore, CredentialVault } from "../ports";
import { bearer, json } from "./http";
import { defineRoute } from "./registry";

const COPILOT_QUOTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "X-GitHub-Api-Version": "2025-04-01",
};

defineRoute({
  group: "sandbox-provider-usage",
  method: "GET",
  path: "/sandbox/provider-usage",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "A runtime's per-sandbox HMAC token authenticates it; the probe runs on a credential no client may hold.",
  source: "packages/host/src/routes/provider-usage.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxProviderUsage(deps, method, path, url, req, res),
});

export async function handleSandboxProviderUsage(
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    fetchImpl?: typeof fetch;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET" || path !== "/sandbox/provider-usage") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const provider = url.searchParams.get("provider");
  if (provider !== "github-copilot") {
    json(res, 400, { error: `no central usage probe for ${provider}` });
    return true;
  }
  const actingHeader = req.headers["x-houston-acting-as"];
  const actingAs = Array.isArray(actingHeader) ? actingHeader[0] : actingHeader;
  const cred = await deps.credentials.get(
    claim.workspaceId,
    provider,
    actingAs ? { actingAs } : undefined,
  );
  if (!cred?.refreshToken) {
    json(
      res,
      404,
      { error: "workspace not connected" },
      { "x-houston-not-connected": "1" },
    );
    return true;
  }
  const apiHost = cred.enterpriseUrl
    ? `api.${cred.enterpriseUrl}`
    : "api.github.com";
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(
      `https://${apiHost}/copilot_internal/user`,
      {
        headers: {
          Authorization: `token ${cred.refreshToken}`,
          ...COPILOT_QUOTA_HEADERS,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (err) {
    json(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
  if (upstream.status === 401 || upstream.status === 403) {
    json(res, 401, { error: "GitHub rejected the stored Copilot token" });
    return true;
  }
  if (!upstream.ok) {
    json(res, 502, {
      error: `Copilot usage API answered ${upstream.status}`,
    });
    return true;
  }
  json(res, 200, await upstream.json());
  return true;
}
