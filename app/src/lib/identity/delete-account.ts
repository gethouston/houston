// Client for the gateway's account-deletion endpoint (HOU-991).
//
// ── CONTRACT (source of truth; server side in cloud/ C12-account-deletion) ──
//   DELETE {gateway}/v1/me   Authorization: Bearer <Firebase ID token>
//     · 204 → the account and every piece of hosted data are gone
//     · 409 { error: "team_member" } → the user still belongs to team spaces;
//       nothing was deleted — they must leave/transfer those teams first
//     · anything else → retryable failure (the flow is idempotent server-side)
// ─────────────────────────────────────────────────────────────────────────
//
// Transport, auth and the update floor are the shared `../gateway-fetch`
// helper's job (live bearer per attempt, one refresh + replay on a 401, build
// identity header, 426 forwarding). Kept dependency-injected so `app/tests` can
// drive it without a window or network.

import {
  type GatewayFetchDeps,
  gatewayFetch,
  liveGatewayDeps,
} from "../gateway-fetch.ts";

/** Why the deletion did not complete. `team_member` is the one NON-retryable
 *  outcome (the server refused and deleted nothing); the rest are transient. */
export type AccountDeletionFailure = "team_member" | "network" | "http";

export class AccountDeletionError extends Error {
  readonly kind: AccountDeletionFailure;
  readonly httpStatus?: number;
  constructor(
    kind: AccountDeletionFailure,
    opts?: { httpStatus?: number; cause?: unknown },
  ) {
    super(`account deletion failed: ${kind}`, { cause: opts?.cause });
    this.name = "AccountDeletionError";
    this.kind = kind;
    this.httpStatus = opts?.httpStatus;
  }
}

/**
 * Issue the deletion request. Resolves on 204; throws `AccountDeletionError`
 * otherwise. Retryable by design: the server deletes the auth user BEFORE the
 * database commit, so a failed attempt leaves a session that can try again.
 */
export async function requestAccountDeletion(
  deps: GatewayFetchDeps,
): Promise<void> {
  let res: Response | null;
  try {
    // No `x-houston-org`: the route is mounted behind `RequireAuth` alone (no
    // org resolution), so the pin is at best noise and at worst a 403 on a
    // stale selector — for the one request whose whole point is leaving.
    res = await gatewayFetch(deps, "/v1/me", {
      method: "DELETE",
      orgScoped: false,
    });
  } catch (e) {
    throw new AccountDeletionError("network", { cause: e });
  }
  // No session at all — the same outcome the gateway would give, without the
  // guaranteed-401 round trip. (`accountDeletionAvailable` already gates the
  // surface on a signed-in user, so this is a belt-and-braces path.)
  if (!res) throw new AccountDeletionError("http", { httpStatus: 401 });
  if (res.status === 204) return;
  if (res.status === 409) {
    throw new AccountDeletionError("team_member", { httpStatus: 409 });
  }
  throw new AccountDeletionError("http", { httpStatus: res.status });
}

/**
 * Whether the "Delete account" surface applies to this deployment: a hosted
 * Houston account must exist (identity configured + signed in), and on desktop
 * the engine must BE the hosted gateway — in local-sidecar mode
 * `window.__HOUSTON_ENGINE__` points at the co-located host, so there is no
 * gateway to delete against (and no hosted account holding user data).
 */
export function accountDeletionAvailable(input: {
  identityConfigured: boolean;
  hasSession: boolean;
  isTauri: boolean;
  hostedGateway: boolean;
}): boolean {
  if (!input.identityConfigured || !input.hasSession) return false;
  return input.hostedGateway || !input.isTauri;
}

/** The live-globals wrapper the settings UI calls. */
export function deleteHostedAccount(): Promise<void> {
  const deps = liveGatewayDeps();
  if (!deps) {
    throw new AccountDeletionError("network", {
      cause: new Error("account deletion unavailable: no gateway configured"),
    });
  }
  return requestAccountDeletion(deps);
}
