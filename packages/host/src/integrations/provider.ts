import type {
  ActionResult,
  Connection,
  ConnectStart,
  CustomIntegrationCreate,
  CustomIntegrationPatch,
  McpServerCreate,
  McpServerPatch,
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

/**
 * An OPTIONAL port extension for providers that let a user register their own
 * bring-your-own-API-key integrations (the custom provider). The rest of the
 * lifecycle — list/disconnect/search/execute — is the generic `IntegrationProvider`
 * surface; only creating and editing an integration is custom-shaped, because it
 * carries the sealed API key. The provider-routes mount create/update ONLY when
 * a provider implements this (else 404), so a plain provider is never asked to.
 */
export interface CustomIntegrationHost {
  /** Register a new custom integration; returns its mapped connection. */
  createCustom(
    userId: string,
    config: CustomIntegrationCreate,
  ): Promise<Connection>;
  /**
   * Edit an existing custom integration (any subset of its config; an omitted
   * apiKey keeps the stored one). Renaming keeps the slug/connectionId stable.
   */
  updateCustom(
    userId: string,
    connectionId: string,
    patch: CustomIntegrationPatch,
  ): Promise<Connection>;
}

/** Narrow a provider to one that supports custom-integration create/update. */
export function supportsCustom(
  provider: IntegrationProvider,
): provider is IntegrationProvider & CustomIntegrationHost {
  const c = provider as Partial<CustomIntegrationHost>;
  return (
    typeof c.createCustom === "function" && typeof c.updateCustom === "function"
  );
}

/**
 * The OPTIONAL port extension for the MCP provider: registering + editing a
 * remote MCP server. Mirrors `CustomIntegrationHost` (the rest of the lifecycle
 * is the generic `IntegrationProvider` surface); only create/update are
 * MCP-shaped because they carry the sealed auth secret (`authValue`). The
 * provider-routes mount create/update ONLY when a provider implements this (else
 * 404), so a provider without MCP support is never asked to.
 */
export interface McpIntegrationHost {
  /** Register a new MCP server integration; returns its mapped connection. */
  createMcpServer(userId: string, config: McpServerCreate): Promise<Connection>;
  /**
   * Edit an existing MCP server (any subset of its config; an omitted authValue
   * keeps the stored secret). Renaming keeps the slug/connectionId stable.
   */
  updateMcpServer(
    userId: string,
    connectionId: string,
    patch: McpServerPatch,
  ): Promise<Connection>;
}

/** Narrow a provider to one that supports MCP-server create/update. */
export function supportsMcp(
  provider: IntegrationProvider,
): provider is IntegrationProvider & McpIntegrationHost {
  const c = provider as Partial<McpIntegrationHost>;
  return (
    typeof c.createMcpServer === "function" &&
    typeof c.updateMcpServer === "function"
  );
}
