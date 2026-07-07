import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  SearchResult,
  Toolkit,
} from "./types";

/**
 * Per-call execution options. `acting` names the user the agent is acting as
 * this turn (C2); `account` pins WHICH connected account to run as when the
 * toolkit has more than one (a connected_account_id for direct adapters — the
 * policy layer resolves any label the model passed to an id first; a gateway
 * adapter forwards it verbatim for the upstream to resolve).
 */
export interface ExecuteOptions {
  acting?: ActingContext;
  account?: string;
}

/**
 * WHO the agent runtime is acting as for one integration call (C2). Read off the
 * runtime→host proxy call by the sandbox route and handed to `search`/`execute`
 * so a gateway adapter can authenticate as that user upstream. Exactly one of
 * the two is set per call in the cloud; both absent locally (single-user).
 *
 *  - `actingAs`:   a signed acting-as token minted by the gateway for the user
 *                  driving THIS turn (a normal message dispatch).
 *  - `actingUser`: the Supabase `sub` of a routine's creator (routine turns,
 *                  where no per-turn token is minted — see C2 "Routine path").
 *
 * The direct adapter (self-host, own key) ignores both — identity is the
 * verified `userId` it already has. Optional so implementors may ignore it.
 */
export interface ActingContext {
  actingAs?: string;
  actingUser?: string;
}

/**
 * The integration-provider PORT: Composio is the first adapter, and a future
 * provider slots in by implementing this same interface. The host routes + the
 * agent's generic tools depend ONLY on this; no provider's wire types or SDK
 * leak past its adapter.
 *
 * Credential model (platform): Houston holds ONE platform API key; users never
 * create a provider account. Every scoped method takes the caller's verified
 * Houston `userId` — the provider keys that user's connections by it. On the
 * desktop the adapter is a thin gateway that forwards to Houston's cloud host
 * (which holds the key and re-derives the userId from the Supabase JWT), so the
 * platform key never ships in a client binary. Self-hosters point the direct
 * adapter at their own provider key instead.
 *
 * Same code in every deployment (local + cloud) — availability is a capability
 * flag, not a forked implementation, so there is no drift.
 */
export interface IntegrationProvider {
  /** Stable id, e.g. "composio". */
  readonly id: string;

  /** Can this deployment serve the user right now (gateway needs a session)? */
  readiness(): Promise<ProviderReadiness>;

  // ── Toolkits + connections (scoped to one Houston user) ───────────────────
  /** The catalog of connectable apps. */
  listToolkits(): Promise<Toolkit[]>;
  /** The toolkits this user has connected. */
  listConnections(userId: string): Promise<Connection[]>;
  /** Start connecting a toolkit; returns the OAuth redirect to send the user to. */
  connect(userId: string, toolkit: string): Promise<ConnectStart>;
  /** One connection by id (poll after connect() until it turns active). */
  connection(userId: string, connectionId: string): Promise<Connection | null>;
  /** Remove ONE connected account by id (ownership-checked). */
  disconnect(userId: string, connectionId: string): Promise<void>;
  /** Rename ONE connected account (its user-facing alias; ownership-checked). */
  rename(userId: string, connectionId: string, alias: string): Promise<void>;

  // ── Execution (what the agent's generic tools call) ───────────────────────
  /**
   * Discover actions matching a natural-language query (slug + param schema).
   * `acting` (optional) names the user the agent is acting as this turn (C2);
   * a gateway adapter authenticates upstream as that user, direct adapters
   * ignore it. Returns `{ items }`; the policy layer may attach `accounts`.
   */
  search(
    userId: string,
    query: string,
    acting?: ActingContext,
  ): Promise<SearchResult>;
  /**
   * Run one action by slug with its params. `opts.acting` as in `search`;
   * `opts.account` pins the connected account when the toolkit has several.
   */
  execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    opts?: ExecuteOptions,
  ): Promise<ActionResult>;
}
