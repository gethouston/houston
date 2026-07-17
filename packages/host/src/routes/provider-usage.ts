import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialStore, CredentialVault } from "../ports";
import { bearer, json } from "./http";

/**
 * Sandbox-facing central usage probe (connect-once). GitHub Copilot's quota
 * endpoint (`GET api.<host>/copilot_internal/user`) authenticates with the
 * LONG-LIVED GitHub OAuth token — which, by design (Gate #2), never leaves
 * this process: the runtime's auth.json is scrubbed to access-only right
 * after login, so the runtime cannot run this probe itself and its Usage row
 * read "sign in again" forever on a perfectly healthy connection. The host
 * runs the probe against its central credential and relays GitHub's quota
 * payload (plan, percentages, reset date — never a token); the runtime maps
 * it onto the wire row exactly as it maps a direct response
 * (packages/runtime/src/ai/usage/copilot.ts, which mirrors these headers).
 *
 * Answers: 200 with GitHub's JSON; 401 when GitHub rejected the stored token
 * (runtime → "sign in again"); marked 404 when the workspace never connected
 * Copilot; 502 for any other upstream failure (runtime → honest error row).
 *
 * Returns true when the request was handled.
 */

const COPILOT_QUOTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "X-GitHub-Api-Version": "2025-04-01",
};

export async function handleSandboxProviderUsage(
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    /** Injectable for tests; defaults to global fetch. */
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
  // Copilot is the only provider whose usage needs the centrally-held token;
  // every other probe runs fine in the runtime with what it already has.
  if (provider !== "github-copilot") {
    json(res, 400, { error: `no central usage probe for ${provider}` });
    return true;
  }
  const cred = await deps.credentials.get(claim.workspaceId, provider);
  if (!cred?.refreshToken) {
    // Same authoritative marker as /sandbox/credential: the store's own
    // "not connected" answer, never a bare route-level 404.
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
    // The stored GitHub token is dead — the runtime's honest row is
    // "sign in again", so relay the auth failure as our own 401.
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
