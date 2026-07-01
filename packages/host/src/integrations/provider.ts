import type {
  AccountIdentity,
  ActionResult,
  Connection,
  ConnectStart,
  LoginResult,
  LoginStart,
  ProviderCredential,
  Toolkit,
  ToolMatch,
} from "./types";

/**
 * The integration-provider PORT — the seam the user asked for: Composio is the
 * first adapter, and a future provider slots in by implementing this same
 * interface. The host routes + the agent's generic tools depend ONLY on this;
 * no provider's wire types or SDK leak past its adapter.
 *
 * Credential model (per the product decision): each user uses THEIR OWN free
 * account with the provider — there is no Houston-held platform key. Auth is
 * acquired per user via startLogin/pollLogin; the host stores the resulting
 * ProviderCredential and passes it back into the scoped methods. The credential
 * never reaches the agent runtime — execution is proxied through the host.
 *
 * Same code in every deployment (local + cloud) — availability is a capability
 * flag, not a forked implementation, so there is no drift.
 */
export interface IntegrationProvider {
  /** Stable id, e.g. "composio". Matches ProviderCredential.provider. */
  readonly id: string;

  // ── Per-user account auth (the user signs into their own account) ──────────
  /** Begin sign-in: returns the URL to open + a key to poll with. */
  startLogin(): Promise<LoginStart>;
  /** Poll a started login; resolves to the user's credential once they finish. */
  pollLogin(pollKey: string): Promise<LoginResult>;
  /** Validate a stored credential; null if invalid/expired. */
  verifyCredential(cred: ProviderCredential): Promise<AccountIdentity | null>;

  // ── Toolkits + connections (scoped to one user's credential) ──────────────
  /** The catalog of connectable apps (in the context of the signed-in user). */
  listToolkits(cred: ProviderCredential): Promise<Toolkit[]>;
  /** The toolkits this user has connected. */
  listConnections(cred: ProviderCredential): Promise<Connection[]>;
  /** Start connecting a toolkit; returns the OAuth redirect to send the user to. */
  connect(cred: ProviderCredential, toolkit: string): Promise<ConnectStart>;
  /** Remove a toolkit connection. */
  disconnect(cred: ProviderCredential, toolkit: string): Promise<void>;

  // ── Execution (what the agent's generic tools call) ───────────────────────
  /** Discover actions matching a natural-language query (slug + param schema). */
  search(cred: ProviderCredential, query: string): Promise<ToolMatch[]>;
  /** Run one action by slug with its params. */
  execute(
    cred: ProviderCredential,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult>;
}
