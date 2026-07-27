import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialStore, CredentialVault } from "../ports";
import { bearer, json, readJson } from "./http";

/**
 * Sandbox-facing: the runtime reporting that a PROVIDER revoked the token this
 * host served it.
 *
 * A revoked token is not an expired one. Nothing on the serve path can see the
 * difference — the credential is present, unexpired, and refreshing it would
 * succeed or fail for unrelated reasons — so the store keeps handing the dead
 * token to every runtime in the workspace and every turn 401s until the clock
 * runs out. Sentry HOUSTON-APP-4YA: 3,935 failed turns across 58 users, all on
 * managed-cloud pods. The runtime's turn is the only witness, and this route is
 * how its testimony reaches the store (HOU-952).
 *
 * The report names the token by digest, never by value, and the store's
 * compare-and-delete drops it only while it is still the stored one — a report
 * from a turn that began before the user reconnected must not delete the
 * credential they just created.
 *
 * Returns true when the request was handled.
 */
export async function handleSandboxCredentialRevoked(
  deps: { vault: CredentialVault; credentials: CredentialStore },
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
  } | null;
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const accessSha256 =
    typeof body?.accessSha256 === "string" ? body.accessSha256.trim() : "";
  if (!provider || !accessSha256) {
    // Refuse rather than guess: a report without a token identity could only
    // be actioned as an unconditional delete, which is the one thing this
    // route must never do.
    json(res, 400, { error: "provider and accessSha256 are required" });
    return true;
  }

  const removed = await deps.credentials.removeIfAccess(
    claim.workspaceId,
    provider,
    accessSha256,
  );
  // Both outcomes are success. `removed:false` means the report was superseded
  // — the workspace reconnected, or a sibling runtime reported the same dead
  // token first — and the reporter's own retry/backoff must not treat that as
  // an error to escalate.
  console[removed ? "error" : "info"](
    `[sandbox/credential] revoked-token report for ${provider}: ${
      removed ? "credential disconnected" : "superseded, left in place"
    }`,
  );
  json(res, 200, { ok: true, removed });
  return true;
}
