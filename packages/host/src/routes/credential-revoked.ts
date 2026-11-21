import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
import type { CredentialStore, CredentialVault } from "../ports";
import { bearer, json, readJson } from "./http";
import { defineRoute } from "./registry";

defineRoute({
  group: "sandbox-credential-revoked",
  method: "POST",
  path: "/sandbox/credential/revoked",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The reporter is an agent runtime holding a per-sandbox HMAC token, never a signed-in client.",
  source: "packages/host/src/routes/credential-revoked.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxCredentialRevoked(deps, method, path, url, req, res),
});

export async function handleSandboxCredentialRevoked(
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    revocations?: RevocationTombstones;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "POST" || path !== "/sandbox/credential/revoked") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }

  const body = (await readJson(req).catch(() => null)) as {
    provider?: unknown;
    accessSha256?: unknown;
    scope?: unknown;
    actingAs?: unknown;
  } | null;
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const accessSha256 =
    typeof body?.accessSha256 === "string" ? body.accessSha256.trim() : "";
  const scope = body?.scope === "personal" ? "personal" : "team";
  const actingAs =
    typeof body?.actingAs === "string" ? body.actingAs : undefined;
  if (!provider || !accessSha256) {
    json(res, 400, { error: "provider and accessSha256 are required" });
    return true;
  }

  let removed: boolean;
  try {
    removed = await deps.credentials.removeIfAccess(
      claim.workspaceId,
      provider,
      accessSha256,
      { scope, actingAs },
    );
  } catch (err) {
    console.warn(
      `[sandbox/credential] revoked-token report for ${provider} could not reach the store:`,
      err instanceof Error ? err.message : err,
    );
    json(res, 502, {
      error: "credential store unavailable; report not applied",
    });
    return true;
  }
  if (removed) {
    const refilled = (deps.revocations ?? sharedRevocationTombstones).mark({
      workspaceId: claim.workspaceId,
      provider,
      scope,
      actingAs,
    });
    if (refilled) {
      console.error(
        `[sandbox/credential] revoked ${provider} credential was refilled and revoked AGAIN within the tombstone window — an automatic push is resurrecting a dead credential`,
      );
    } else {
      console.info(
        `[sandbox/credential] revoked-token report for ${provider}: credential disconnected`,
      );
    }
  } else {
    console.info(
      `[sandbox/credential] revoked-token report for ${provider}: superseded, left in place`,
    );
  }
  json(res, 200, { ok: true, removed });
  return true;
}
