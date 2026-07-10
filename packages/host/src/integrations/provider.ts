import type {
  ActionResult,
  Connection,
  ConnectStart,
  ProviderReadiness,
  Toolkit,
  ToolMatch,
  TriggerInstanceRef,
  TriggerType,
  TriggerUpsertBinding,
} from "./types";

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
  /** Remove a toolkit connection. */
  disconnect(userId: string, toolkit: string): Promise<void>;

  // ── Execution (what the agent's generic tools call) ───────────────────────
  /**
   * Discover actions matching a natural-language query (slug + param schema).
   * `acting` (optional) names the user the agent is acting as this turn (C2);
   * a gateway adapter authenticates upstream as that user, direct adapters
   * ignore it.
   */
  search(
    userId: string,
    query: string,
    acting?: ActingContext,
  ): Promise<ToolMatch[]>;
  /**
   * Run one action by slug with its params. `acting` (optional) as in `search`.
   */
  execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
  ): Promise<ActionResult>;

  // ── Triggers (C9 event-driven routines; reconciler verbs) ─────────────────
  /**
   * The trigger catalog for one toolkit — the events a routine can wake on
   * (each with its config + payload JSON schema), for the UI picker.
   */
  listTriggerTypes(toolkit: string): Promise<TriggerType[]>;
  /**
   * Create-or-update the Composio trigger instance for a binding and return its
   * id. Idempotent per (account, trigger, config) — the reconciler calls it to
   * converge desired → actual. The direct adapter resolves the connected
   * account (pinned id, else the user's single active one); the gateway adapter
   * refuses (the desktop never reconciles — see TriggersUnsupportedError).
   */
  upsertTriggerInstance(
    userId: string,
    binding: TriggerUpsertBinding,
  ): Promise<TriggerInstanceRef>;
  /** Enable or disable a provisioned instance (the reconciler's disable path). */
  setTriggerInstanceStatus(
    triggerInstanceId: string,
    status: "enable" | "disable",
  ): Promise<void>;
  /** Delete a provisioned instance (routine gone / revoked / disconnected). */
  deleteTriggerInstance(triggerInstanceId: string): Promise<void>;
  /**
   * Point the provider's ONE project-level webhook at `webhookUrl` — the
   * bootstrap the self-host does once at startup so delivered events reach its
   * ingress route. Idempotent (re-registering the same URL is a no-op upstream).
   * Direct adapter → Composio's webhook-subscription API; the gateway adapter
   * refuses (the desktop never owns the webhook — TriggersUnsupportedError).
   */
  ensureWebhookSubscription(webhookUrl: string): Promise<void>;
}
