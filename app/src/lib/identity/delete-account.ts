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
// Auth mirrors `cloud-migration-transport.ts` (the app-side gatewayAuthFetch
// idiom): the bearer is read LIVE from `window.__HOUSTON_ENGINE__` per attempt,
// and a 401 triggers one session refresh via `window.__HOUSTON_SESSION_REFRESH__`
// plus one replay. Kept dependency-injected so `app/tests` can drive it without
// a window or network.

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

export interface AccountDeletionDeps {
  /** Gateway base URL (no trailing slash needed; it is stripped). */
  baseUrl: string;
  /** The current bearer, read fresh per call. */
  token: () => string | undefined;
  /** Mint a fresh bearer after a 401; resolves null when it cannot. */
  refresh: () => Promise<string | null>;
  fetchFn: typeof fetch;
}

/**
 * Issue the deletion request. Resolves on 204; throws `AccountDeletionError`
 * otherwise. Retryable by design: the server deletes the auth user BEFORE the
 * database commit, so a failed attempt leaves a session that can try again.
 */
export async function requestAccountDeletion(
  deps: AccountDeletionDeps,
): Promise<void> {
  const url = `${deps.baseUrl.replace(/\/+$/, "")}/v1/me`;
  const send = async (bearer: string | undefined): Promise<Response> => {
    try {
      return await deps.fetchFn(url, {
        method: "DELETE",
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });
    } catch (e) {
      throw new AccountDeletionError("network", { cause: e });
    }
  };

  let res = await send(deps.token());
  if (res.status === 401) {
    const fresh = await deps.refresh().catch(() => null);
    if (fresh) res = await send(fresh);
  }
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
  const cfg = typeof window !== "undefined" ? window.__HOUSTON_ENGINE__ : null;
  if (!cfg?.baseUrl) {
    throw new AccountDeletionError("network", {
      cause: new Error("account deletion unavailable: no gateway configured"),
    });
  }
  return requestAccountDeletion({
    baseUrl: cfg.baseUrl,
    token: () => window.__HOUSTON_ENGINE__?.token,
    refresh: async () => (await window.__HOUSTON_SESSION_REFRESH__?.()) ?? null,
    fetchFn: (input, init) => fetch(input, init),
  });
}
