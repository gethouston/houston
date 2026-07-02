import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
} from "./types";

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
  /** Remove a toolkit connection. */
  disconnect(userId: string, toolkit: string): Promise<void>;

  // ── Execution (what the agent's generic tools call) ───────────────────────
  /** Discover actions matching a natural-language query (slug + param schema). */
  search(userId: string, query: string): Promise<ToolMatch[]>;
  /** Run one action by slug with its params. */
  execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult>;
}
