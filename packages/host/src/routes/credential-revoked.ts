import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
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
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    /** Injectable for tests; defaults to the process-wide ledger. */
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
  // WHOSE row, for a personal credential: the reporter's acting-as token, which
  // the store forwards so the gateway can key the delete by (org, user,
  // provider). A team report has none, and must stay valid without one.
  const actingAs =
    typeof body?.actingAs === "string" ? body.actingAs : undefined;
  if (!provider || !accessSha256) {
    // Refuse rather than guess: a report without a token identity could only
    // be actioned as an unconditional delete, which is the one thing this
    // route must never do.
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
    // A store/gateway hiccup: answer a clean 502 so the reporting runtime
    // retries on its next serve sync (quietly — served-key-guard dedupes its
    // own error) instead of the unhandled-throw 500 that turned every retry
    // into fresh Sentry noise (HOUSTON-APP-567).
    console.warn(
      `[sandbox/credential] revoked-token report for ${provider} could not reach the store:`,
      err instanceof Error ? err.message : err,
    );
    json(res, 502, {
      error: "credential store unavailable; report not applied",
    });
    return true;
  }
  // Both outcomes are success. `removed:false` means the report was superseded
  // — the workspace reconnected, or a sibling runtime reported the same dead
  // token first — and the reporter's own retry/backoff must not treat that as
  // an error to escalate. A confirmed removal is the pipeline WORKING (the
  // user gets the reconnect card), so it logs info, not error — Sentry
  // HOUSTON-APP-530 was this line at error level, one event per expected
  // disconnect. The tombstone it leaves behind is what blocks automatic
  // refills of the dead credential (revocation-tombstones.ts); a SECOND
  // confirmed removal inside the tombstone window means something refilled a
  // revoked credential past those guards — the one outcome that IS a defect,
  // and the only one that still logs at error level.
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
